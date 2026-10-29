(function () {
  const RELAY_BASE = 'http://127.0.0.1:38473';
  const RELAY_HEALTH = `${RELAY_BASE}/health`;
  const RELAY_WHIP = `${RELAY_BASE}/whip`;

  const TRACK_IDS = { gameplay: 'gameplay', webcam: 'webcam', mic: 'mic' };

  const els = {
    canvas: document.getElementById('program-canvas'),
    empty: document.getElementById('program-empty'),
    statusDot: document.getElementById('relay-status-dot'),
    statusText: document.getElementById('relay-status-text'),
    log: document.getElementById('stream-log'),
    btnWebcam: document.getElementById('btn-webcam'),
    btnScreen: document.getElementById('btn-screen'),
    btnMic: document.getElementById('btn-mic'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    modal: document.getElementById('relay-modal'),
    modalClose: document.getElementById('modal-close'),
  };

  const ctx = els.canvas.getContext('2d');
  let raf = 0;
  let screenStream = null;
  let webcamStream = null;
  let micStream = null;
  let whipPublisher = null;
  let relayReady = false;

  function log(line) {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    els.log.textContent = (els.log.textContent ? els.log.textContent + '\n' : '') + `[${ts}] ${line}`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function setRelayStatus(state, text) {
    els.statusDot.dataset.state = state;
    els.statusText.textContent = text;
  }

  function resizeCanvas() {
    const rect = els.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(640, Math.floor(rect.width));
    const h = Math.max(360, Math.floor(rect.height));
    if (els.canvas.width !== w || els.canvas.height !== h) {
      els.canvas.width = w;
      els.canvas.height = h;
    }
  }

  const videoEls = new Map();
  function drawVideo(stream, dx, dy, dw, dh) {
    let video = videoEls.get(stream);
    if (!video) {
      video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      videoEls.set(stream, video);
      video.play().catch(() => undefined);
    }
    if (video.readyState >= 2) {
      const vw = video.videoWidth || 16;
      const vh = video.videoHeight || 9;
      const scale = Math.max(dw / vw, dh / vh);
      const sw = dw / scale;
      const sh = dh / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  function drawFrame() {
    resizeCanvas();
    const w = els.canvas.width;
    const h = els.canvas.height;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, w, h);

    const main = screenStream || webcamStream;
    if (main && main.getVideoTracks()[0]) drawVideo(main, 0, 0, w, h);

    if (screenStream && webcamStream && webcamStream.getVideoTracks()[0]) {
      const pipW = Math.round(w * 0.22);
      const pipH = Math.round(pipW * (9 / 16));
      const x = w - pipW - 16;
      const y = h - pipH - 16;
      ctx.strokeStyle = '#ffc40c';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 2, y - 2, pipW + 4, pipH + 4);
      drawVideo(webcamStream, x, y, pipW, pipH);
    }

    els.empty.hidden = Boolean(main);
    raf = requestAnimationFrame(drawFrame);
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    const v = videoEls.get(stream);
    if (v) {
      v.srcObject = null;
      videoEls.delete(stream);
    }
  }

  async function probeRelay() {
    try {
      const res = await fetch(RELAY_HEALTH, { method: 'GET', mode: 'cors', cache: 'no-store' });
      relayReady = res.ok;
      setRelayStatus(relayReady ? 'ok' : 'warn', relayReady ? 'Relay on localhost:38473' : 'Relay not responding');
      if (relayReady) log('Relay health OK — WHIP publish available.');
    } catch {
      relayReady = false;
      setRelayStatus('warn', 'Relay not detected');
      log('No relay on 127.0.0.1:38473 (install desktop app or MAKA.relay).');
    }
  }

  function namedStream(id, tracks) {
    const stream = new MediaStream(tracks);
    Object.defineProperty(stream, 'id', { value: id, writable: false, configurable: true });
    return stream;
  }

  function waitForIce(pc, timeoutMs) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', onChange);
        clearTimeout(timer);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      pc.addEventListener('icegatheringstatechange', onChange);
      const timer = setTimeout(done, timeoutMs || 4000);
    });
  }

  function attachWhipSources(pc, sources) {
    const add = (stream, id) => {
      if (!stream) return;
      const tracks = stream.getTracks().filter((t) => t.readyState === 'live');
      if (!tracks.length) return;
      const named = namedStream(id, tracks);
      for (const track of tracks) pc.addTrack(track, named);
    };
    add(sources.gameplay, TRACK_IDS.gameplay);
    add(sources.webcam, TRACK_IDS.webcam);
    add(sources.mic, TRACK_IDS.mic);
  }

  async function publishWhip(sources) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    attachWhipSources(pc, sources);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc, 5000);
    const sdp = pc.localDescription && pc.localDescription.sdp;
    if (!sdp) {
      pc.close();
      throw new Error('Empty WHIP offer');
    }
    const response = await fetch(RELAY_WHIP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: sdp,
    });
    if (!response.ok) {
      pc.close();
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(`WHIP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const answer = await response.text();
    const location = response.headers.get('Location');
    const resourceUrl = location ? new URL(location, RELAY_WHIP).href : null;
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    return {
      pc,
      resourceUrl,
      async close() {
        if (resourceUrl) {
          try {
            await fetch(resourceUrl, { method: 'DELETE' });
          } catch {
            /* ignore */
          }
        }
        pc.close();
      },
    };
  }

  function buildPublishSources() {
    const canvasStream = els.canvas.captureStream(30);
    const gameplay = namedStream(TRACK_IDS.gameplay, canvasStream.getVideoTracks());
    let webcam = null;
    if (screenStream && webcamStream) {
      webcam = namedStream(TRACK_IDS.webcam, webcamStream.getVideoTracks());
    }
    let mic = null;
    if (micStream && micStream.getAudioTracks()[0]) {
      mic = namedStream(TRACK_IDS.mic, micStream.getAudioTracks());
    }
    return { gameplay, webcam, mic };
  }

  function hasCapture() {
    return Boolean(
      (screenStream && screenStream.getVideoTracks()[0]) ||
        (webcamStream && webcamStream.getVideoTracks()[0]),
    );
  }

  function updateButtons() {
    els.btnStart.disabled = !hasCapture() || Boolean(whipPublisher);
    els.btnStop.disabled = !whipPublisher;
  }

  async function onStart() {
    if (!hasCapture()) {
      log('Add webcam or screen share first.');
      return;
    }
    await probeRelay();
    if (!relayReady) {
      els.modal.hidden = false;
      return;
    }
    try {
      log('Publishing WHIP to localhost relay…');
      whipPublisher = await publishWhip(buildPublishSources());
      whipPublisher.pc.onconnectionstatechange = () => {
        log(`WHIP connection: ${whipPublisher.pc.connectionState}`);
        if (whipPublisher.pc.connectionState === 'connected') setRelayStatus('live', 'Live via relay');
      };
      setRelayStatus('live', 'Live via relay');
      log('WHIP active. Set RTMP keys in desktop Maka or relay /config.');
      updateButtons();
    } catch (err) {
      whipPublisher = null;
      log(`WHIP failed: ${err instanceof Error ? err.message : err}`);
      els.modal.hidden = false;
      updateButtons();
    }
  }

  async function onStop() {
    if (!whipPublisher) return;
    await whipPublisher.close().catch(() => undefined);
    whipPublisher = null;
    setRelayStatus(relayReady ? 'ok' : 'warn', relayReady ? 'Relay on localhost:38473' : 'Relay not detected');
    updateButtons();
  }

  els.btnWebcam.addEventListener('click', async () => {
    stopStream(webcamStream);
    webcamStream = null;
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      log('Webcam added.');
    } catch (err) {
      log(`Webcam denied: ${err instanceof Error ? err.message : err}`);
    }
    updateButtons();
  });

  els.btnScreen.addEventListener('click', async () => {
    stopStream(screenStream);
    screenStream = null;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStream.getVideoTracks()[0].onended = () => {
        screenStream = null;
        updateButtons();
      };
      log('Screen share added.');
    } catch (err) {
      log(`Screen share denied: ${err instanceof Error ? err.message : err}`);
    }
    updateButtons();
  });

  els.btnMic.addEventListener('click', async () => {
    stopStream(micStream);
    micStream = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      log('Microphone added.');
    } catch (err) {
      log(`Mic denied: ${err instanceof Error ? err.message : err}`);
    }
    updateButtons();
  });

  els.btnStart.addEventListener('click', () => void onStart());
  els.btnStop.addEventListener('click', () => void onStop());
  els.modalClose.addEventListener('click', () => {
    els.modal.hidden = true;
  });
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) els.modal.hidden = true;
  });

  window.addEventListener('resize', resizeCanvas);
  drawFrame();
  void probeRelay();
  updateButtons();
  log('Browser MVP — preview locally; relay encodes to RTMP.');
})();
