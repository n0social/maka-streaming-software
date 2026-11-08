(function () {
  function resolveRelayBase() {
    const params = new URLSearchParams(window.location.search);
    const relayParam = params.get('relay');
    if (relayParam) return relayParam.replace(/\/$/, '');
    const host = window.location.hostname;
    if (host === 'makalive.stream' || host === 'www.makalive.stream') {
      return `${window.location.origin}/relay`;
    }
    return 'http://127.0.0.1:38473';
  }

  const RELAY_BASE = resolveRelayBase();
  const PATHS = {
    health: '/health',
    status: '/status',
    config: '/config',
    verify: '/config/verify',
    stop: '/stop',
    scene: '/scene',
    whip: '/whip',
  };

  const TRACK_IDS = { gameplay: 'gameplay', webcam: 'webcam', mic: 'mic' };
  const STATUS_POLL_MS = 2000;

  /** Mirrors `src/shared/stream-encode-profiles.ts` (static site has no bundler). */
  const ENCODE_PROFILES = {
    '720p30': { width: 1280, height: 720, fps: 30, bitrateMbps: 3 },
    '720p60': { width: 1280, height: 720, fps: 60, bitrateMbps: 4.5 },
    '1080p30': { width: 1920, height: 1080, fps: 30, bitrateMbps: 4.5 },
    '1080p60': { width: 1920, height: 1080, fps: 60, bitrateMbps: 6 },
    '2k60': { width: 2560, height: 1440, fps: 60, bitrateMbps: 10 },
    '4k60': { width: 3840, height: 2160, fps: 60, bitrateMbps: 16 },
  };

  function normalizeProfile(id) {
    if (id && Object.prototype.hasOwnProperty.call(ENCODE_PROFILES, id)) return id;
    return '720p30';
  }

  function profileSpec(id) {
    return ENCODE_PROFILES[normalizeProfile(id)];
  }

  const els = {
    canvas: document.getElementById('program-canvas'),
    empty: document.getElementById('program-empty'),
    statusDot: document.getElementById('relay-status-dot'),
    statusText: document.getElementById('relay-status-text'),
    statusJson: document.getElementById('relay-status-json'),
    relayVersionLine: document.getElementById('relay-version-line'),
    log: document.getElementById('stream-log'),
    btnWebcam: document.getElementById('btn-webcam'),
    btnScreen: document.getElementById('btn-screen'),
    btnMic: document.getElementById('btn-mic'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    btnRelayRefresh: document.getElementById('btn-relay-refresh'),
    btnConfig: document.getElementById('btn-config'),
    btnVerify: document.getElementById('btn-verify'),
    cfgProfile: document.getElementById('cfg-profile'),
    cfgTwitchKey: document.getElementById('cfg-twitch-key'),
    cfgYoutubeKey: document.getElementById('cfg-youtube-key'),
    modal: document.getElementById('relay-modal'),
    modalClose: document.getElementById('modal-close'),
    streamError: document.getElementById('stream-error'),
    streamStatsLine: document.getElementById('stream-stats-line'),
  };

  const ctx = els.canvas.getContext('2d');
  let screenStream = null;
  let webcamStream = null;
  let micStream = null;
  let whipPublisher = null;
  let relayHealth = null;
  let statusPollTimer = 0;
  let sessionLiveIntent = false;

  function setStreamError(message) {
    if (!message) {
      els.streamError.hidden = true;
      els.streamError.textContent = '';
      return;
    }
    els.streamError.hidden = false;
    els.streamError.textContent = message;
  }

  function updateStatsLine(extra) {
    const profile = normalizeProfile(els.cfgProfile.value);
    const spec = profileSpec(profile);
    const relayBit = relayHealth ? `relay ${RELAY_BASE}` : 'relay offline';
    const line = `${spec.width}×${spec.height} @ ${spec.fps}fps · ${spec.bitrateMbps} Mbps · ${relayBit}`;
    els.streamStatsLine.textContent = extra ? `${line} · ${extra}` : line;
  }

  function log(line) {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    els.log.textContent = (els.log.textContent ? els.log.textContent + '\n' : '') + `[${ts}] ${line}`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function logError(line) {
    log(line);
    setStreamError(line);
  }

  function setRelayStatus(state, text) {
    els.statusDot.dataset.state = state;
    els.statusText.textContent = text;
  }

  function authHeaders() {
    if (!relayHealth?.relayToken) return {};
    return { Authorization: `Bearer ${relayHealth.relayToken}` };
  }

  async function relayFetch(path, init) {
    return fetch(`${RELAY_BASE}${path}`, {
      ...init,
      mode: 'cors',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  }

  function renderStatusJson(data) {
    els.statusJson.textContent = data ? JSON.stringify(data, null, 2) : '';
  }

  async function probeRelay() {
    try {
      const res = await fetch(`${RELAY_BASE}${PATHS.health}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      relayHealth = await res.json();
      if (!relayHealth?.ok) throw new Error('health ok=false');
      const version = relayHealth.version ?? '?';
      const mock = String(version).includes('mock');
      setRelayStatus('ok', mock ? `Dev relay v${version}` : `MAKA.relay v${version}`);
      els.relayVersionLine.textContent = `Connected — ${mock ? 'mock' : 'MAKA.relay'} v${version} · WHIP ${RELAY_BASE}${PATHS.whip}`;
      setStreamError(null);
      updateStatsLine();
      log(`Relay health OK (v${version}) at ${RELAY_BASE}.`);
      await refreshRelayStatus();
      startStatusPoll();
      return true;
    } catch (err) {
      relayHealth = null;
      stopStatusPoll();
      renderStatusJson(null);
      setRelayStatus('warn', 'Relay not detected');
      els.relayVersionLine.textContent = `No relay at ${RELAY_BASE} — run npm run web:relay or open /relay/health on staging.`;
      updateStatsLine();
      const detail = err instanceof Error ? err.message : String(err);
      logError(`No relay at ${RELAY_BASE} (${detail}).`);
      return false;
    }
  }

  async function refreshRelayStatus() {
    if (!relayHealth?.relayToken) return null;
    try {
      const res = await relayFetch(PATHS.status);
      if (!res.ok) return null;
      const status = await res.json();
      renderStatusJson(status);
      if (status.status === 'live') {
        setRelayStatus('live', 'Live — relay encoding');
        updateStatsLine('live');
        setStreamError(null);
      } else if (status.status === 'error') {
        const msg = status.error || 'Relay error';
        setRelayStatus('warn', msg);
        logError(msg);
      } else {
        updateStatsLine(status.status || 'idle');
      }

      if (
        sessionLiveIntent &&
        whipPublisher &&
        status.whipSessionActive === false &&
        status.status !== 'live'
      ) {
        logError('Relay lost WHIP session (orphan). Stop and go live again to re-publish.');
      }

      return status;
    } catch {
      return null;
    }
  }

  function startStatusPoll() {
    stopStatusPoll();
    statusPollTimer = window.setInterval(() => void refreshRelayStatus(), STATUS_POLL_MS);
  }

  function stopStatusPoll() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = 0;
    }
  }

  function buildConfigBody() {
    const profile = normalizeProfile(els.cfgProfile.value);
    const spec = profileSpec(profile);
    const body = { profile, bitrateMbps: spec.bitrateMbps };
    const twitch = els.cfgTwitchKey.value.trim();
    const youtube = els.cfgYoutubeKey.value.trim();
    if (twitch) body.twitchKey = twitch;
    if (youtube) body.youtubeKey = youtube;
    return body;
  }

  async function postRelayConfig() {
    if (!relayHealth) throw new Error('Relay not connected');
    const res = await relayFetch(PATHS.config, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildConfigBody()),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).trim();
      throw new Error(`Config failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    log('POST /config applied (keys stay in relay RAM).');
    setStreamError(null);
    await refreshRelayStatus();
  }

  async function verifyRelayConfig() {
    if (!relayHealth) throw new Error('Relay not connected');
    const res = await relayFetch(PATHS.verify, { method: 'POST' });
    if (!res.ok) throw new Error(`Verify HTTP ${res.status}`);
    const data = await res.json();
    const msg = data.ok ? 'Verify OK — ' + (data.message || '') : 'Verify failed — ' + (data.message || '');
    log(msg);
    if (data.ok) setStreamError(null);
    else setStreamError(msg);
    return data;
  }

  async function postRelayStop() {
    await relayFetch(PATHS.stop, { method: 'POST' }).catch(() => undefined);
  }

  async function postSceneLayout() {
    if (!relayHealth) return;
    const profile = normalizeProfile(els.cfgProfile.value);
    const spec = profileSpec(profile);
    const w = spec.width;
    const h = spec.height;
    const layout = {
      canvas: { width: w, height: h },
      sources: [
        {
          id: 'gameplay',
          type: 'video',
          label: 'Gameplay',
          x: 0,
          y: 0,
          width: w,
          height: h,
          zIndex: 0,
        },
      ],
    };
    if (webcamStream) {
      const pipW = Math.round(w * 0.22);
      const pipH = Math.round(pipW * (9 / 16));
      layout.sources.push({
        id: 'webcam',
        type: 'video',
        label: 'Webcam',
        x: w - pipW - 24,
        y: h - pipH - 24,
        width: pipW,
        height: pipH,
        zIndex: 2,
      });
    }
    await relayFetch(PATHS.scene, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    }).catch(() => undefined);
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
    requestAnimationFrame(drawFrame);
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

  function preferH264VideoCodecs(pc) {
    const caps = RTCRtpSender.getCapabilities('video');
    if (!caps) return;
    const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase().includes('h264'));
    const other = caps.codecs.filter((c) => !c.mimeType.toLowerCase().includes('h264'));
    if (!h264.length) return;
    const ordered = [...h264, ...other];
    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.sender.track?.kind !== 'video') continue;
      try {
        transceiver.setCodecPreferences(ordered);
      } catch {
        /* ignore */
      }
    }
  }

  async function publishWhip(sources) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    attachWhipSources(pc, sources);
    preferH264VideoCodecs(pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc, 5000);
    const sdp = pc.localDescription && pc.localDescription.sdp;
    if (!sdp) {
      pc.close();
      throw new Error('Empty WHIP offer');
    }
    const response = await fetch(`${RELAY_BASE}${PATHS.whip}`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/sdp', ...authHeaders() },
      body: sdp,
    });
    if (!response.ok) {
      pc.close();
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(`WHIP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const answer = await response.text();
    const location = response.headers.get('Location');
    const resourceUrl = location ? new URL(location, `${RELAY_BASE}${PATHS.whip}`).href : null;
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    return {
      pc,
      resourceUrl,
      async close() {
        if (resourceUrl) {
          try {
            await fetch(resourceUrl, { method: 'DELETE', headers: authHeaders() });
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
    const ok = relayHealth ? true : await probeRelay();
    if (!ok) {
      els.modal.hidden = false;
      return;
    }
    try {
      setStreamError(null);
      await postRelayConfig();
      await postSceneLayout();
      log(`Publishing WHIP to ${RELAY_BASE}${PATHS.whip}…`);
      sessionLiveIntent = true;
      whipPublisher = await publishWhip(buildPublishSources());
      whipPublisher.pc.onconnectionstatechange = () => {
        log(`WHIP connection: ${whipPublisher.pc.connectionState}`);
        if (whipPublisher.pc.connectionState === 'connected') {
          setRelayStatus('live', 'Live via relay');
          void refreshRelayStatus();
        }
      };
      setRelayStatus('live', 'Live via relay');
      log('WHIP active — check relay /status for pipeline state.');
      updateButtons();
      await refreshRelayStatus();
    } catch (err) {
      sessionLiveIntent = false;
      whipPublisher = null;
      logError(`Go live failed: ${err instanceof Error ? err.message : err}`);
      els.modal.hidden = false;
      updateButtons();
    }
  }

  async function onStop() {
    sessionLiveIntent = false;
    if (whipPublisher) {
      await whipPublisher.close().catch(() => undefined);
      whipPublisher = null;
    }
    await postRelayStop();
    if (relayHealth) setRelayStatus('ok', `Relay v${relayHealth.version}`);
    await refreshRelayStatus();
    updateButtons();
    log('Stream stopped.');
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
  els.btnRelayRefresh.addEventListener('click', () => void probeRelay());
  els.btnConfig.addEventListener('click', () => {
    void postRelayConfig().catch((err) => logError(err instanceof Error ? err.message : String(err)));
  });
  els.btnVerify.addEventListener('click', () => {
    void verifyRelayConfig().catch((err) => logError(err instanceof Error ? err.message : String(err)));
  });
  els.cfgProfile.addEventListener('change', () => {
    updateStatsLine();
    if (relayHealth) {
      void postRelayConfig().catch((err) => log(err instanceof Error ? err.message : String(err)));
    }
  });
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
  log('Web studio — connect relay → configure → go live (see docs/web-relay.md).');
})();
