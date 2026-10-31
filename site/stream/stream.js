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

  /** Mirrors `src/shared/stream-keys.ts` (static site has no bundler). */
  function normalizeStreamKey(raw) {
    let key = String(raw ?? '').trim();
    const fromRtmpUrl = key.match(/rtmps?:\/\/[^/]+\/app\/([^/?#\s]+)/i);
    if (fromRtmpUrl?.[1]) return fromRtmpUrl[1];
    const fromAppPath = key.match(/\/app\/([^/?#\s]+)/i);
    if (fromAppPath?.[1]) return fromAppPath[1];
    return key;
  }

  function validateRelayStreamKeys(input) {
    const twitch = normalizeStreamKey(input.twitchKey ?? '');
    const youtube = normalizeStreamKey(input.youtubeKey ?? '');
    const customEnabled = Boolean(input.customEnabled);
    const customUrl = (input.customRtmpUrl ?? '').trim();
    const customKey = normalizeStreamKey(input.customRtmpKey ?? '');

    if (!twitch && !youtube && !(customEnabled && customUrl && customKey)) {
      return {
        ok: false,
        message: 'Enable at least one destination (Twitch, YouTube, or Custom RTMP).',
      };
    }
    if (twitch) {
      if (twitch.length < 15 || !/^live_[a-zA-Z0-9_]+$/.test(twitch)) {
        return { ok: false, message: 'Twitch key must start with live_ (15+ characters).' };
      }
    }
    if (youtube) {
      if (youtube.length < 16 || !/^[a-z0-9-]{16,64}$/i.test(youtube)) {
        return { ok: false, message: 'YouTube stream key must be 16–64 letters, numbers, or dashes.' };
      }
    }
    if (customEnabled && (customUrl || customKey)) {
      if (!customUrl || !customKey) {
        return { ok: false, message: 'Custom RTMP needs an ingest URL and stream key.' };
      }
      if (!/^rtmps?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[\w./-]*)?$/i.test(customUrl)) {
        return { ok: false, message: 'Custom RTMP URL must start with rtmp:// or rtmps://' };
      }
      if (customKey.length < 8 || customKey.length > 256) {
        return { ok: false, message: 'Custom RTMP stream key must be 8–256 characters.' };
      }
    }
    return { ok: true };
  }

  const els = {
    canvas: document.getElementById('program-canvas'),
    empty: document.getElementById('program-empty'),
    relayChip: document.getElementById('relay-chip'),
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
    btnGoLiveTop: document.getElementById('btn-go-live-top'),
    btnGoLiveLabel: document.getElementById('btn-go-live-label'),
    btnRelayRefresh: document.getElementById('btn-relay-refresh'),
    btnConfig: document.getElementById('btn-config'),
    btnVerify: document.getElementById('btn-verify'),
    btnAddScene: document.getElementById('btn-add-scene'),
    sceneList: document.getElementById('scene-list'),
    destTwitch: document.getElementById('dest-twitch'),
    destYoutube: document.getElementById('dest-youtube'),
    destCustom: document.getElementById('dest-custom'),
    cfgProfile: document.getElementById('cfg-profile'),
    cfgTwitchKey: document.getElementById('cfg-twitch-key'),
    cfgYoutubeKey: document.getElementById('cfg-youtube-key'),
    cfgCustomRtmpUrl: document.getElementById('cfg-custom-rtmp-url'),
    cfgCustomRtmpKey: document.getElementById('cfg-custom-rtmp-key'),
    modal: document.getElementById('relay-modal'),
    modalClose: document.getElementById('modal-close'),
    streamError: document.getElementById('stream-error'),
    statDropped: document.getElementById('stat-dropped'),
    statFps: document.getElementById('stat-fps'),
    statResolution: document.getElementById('stat-resolution'),
    statHealth: document.getElementById('stat-health'),
    streamLivePill: document.getElementById('stream-live-pill'),
    streamTitle: document.getElementById('stream-title'),
    streamDuration: document.getElementById('stream-duration'),
    streamViewers: document.getElementById('stream-viewers'),
    micMeter: document.getElementById('mic-meter'),
    studioStatusDot: document.getElementById('studio-status-dot'),
    studioStatusText: document.getElementById('studio-status-text'),
  };

  const ctx = els.canvas.getContext('2d');
  let screenStream = null;
  let webcamStream = null;
  let micStream = null;
  let whipPublisher = null;
  let relayHealth = null;
  let statusPollTimer = 0;
  let sessionLiveIntent = false;

  const DEFAULT_SCENES = [
    { id: 'scene-gameplay', name: 'Gameplay', icon: '🎮' },
    { id: 'scene-starting', name: 'Starting Soon', icon: '📄' },
    { id: 'scene-chatting', name: 'Just Chatting', icon: '▶️' },
    { id: 'scene-intermission', name: 'Intermission', icon: '⏸️' },
    { id: 'scene-ending', name: 'Ending Scene', icon: '🏠' },
  ];

  /** @type {{ id: string, name: string, icon?: string }[]} */
  let scenes = DEFAULT_SCENES.map((s) => ({ ...s }));
  let activeSceneId = 'scene-gameplay';
  let liveStartedAt = 0;
  let durationTimer = 0;
  let micMeterTimer = 0;

  function activeSceneName() {
    return scenes.find((s) => s.id === activeSceneId)?.name ?? 'Scene 1';
  }

  function renderSceneList() {
    if (!els.sceneList) return;
    els.sceneList.replaceChildren();
    for (const scene of scenes) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item' + (scene.id === activeSceneId ? ' is-on' : '');
      const icon = document.createElement('span');
      icon.className = 'scene-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = scene.icon || '🎬';
      btn.appendChild(icon);
      btn.appendChild(document.createTextNode(scene.name));
      btn.setAttribute('aria-current', scene.id === activeSceneId ? 'true' : 'false');
      btn.addEventListener('click', () => {
        void switchScene(scene.id);
      });
      li.appendChild(btn);
      els.sceneList.appendChild(li);
    }
    const addLi = document.createElement('li');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'studio-list-item studio-list-add';
    addBtn.id = 'btn-add-scene-alt';
    const addIcon = document.createElement('span');
    addIcon.className = 'scene-icon';
    addIcon.setAttribute('aria-hidden', 'true');
    addIcon.textContent = '+';
    addBtn.appendChild(addIcon);
    addBtn.appendChild(document.createTextNode('Add Scene'));
    addBtn.addEventListener('click', () => addScene());
    addLi.appendChild(addBtn);
    els.sceneList.appendChild(addLi);
  }

  async function switchScene(sceneId) {
    if (!scenes.some((s) => s.id === sceneId)) return;
    activeSceneId = sceneId;
    renderSceneList();
    log(`Active scene: ${activeSceneName()}.`);
    if (relayHealth) {
      await postSceneLayout();
    }
  }

  function addScene() {
    const n = scenes.filter((s) => !DEFAULT_SCENES.some((d) => d.id === s.id)).length + 1;
    const id = `scene-custom-${Date.now()}`;
    scenes.push({ id, name: `Scene ${n}`, icon: '🎬' });
    renderSceneList();
    void switchScene(id);
  }

  function syncDestinationInputs() {
    const twitchOn = els.destTwitch.checked;
    const youtubeOn = els.destYoutube.checked;
    const customOn = els.destCustom.checked;
    els.cfgTwitchKey.disabled = !twitchOn;
    els.cfgYoutubeKey.disabled = !youtubeOn;
    els.cfgCustomRtmpUrl.disabled = !customOn;
    els.cfgCustomRtmpKey.disabled = !customOn;
  }

  function destinationInputsForConfig() {
    const twitch = els.destTwitch.checked ? normalizeStreamKey(els.cfgTwitchKey.value) : '';
    const youtube = els.destYoutube.checked ? normalizeStreamKey(els.cfgYoutubeKey.value) : '';
    const customUrl = els.destCustom.checked ? els.cfgCustomRtmpUrl.value.trim() : '';
    const customKey = els.destCustom.checked ? normalizeStreamKey(els.cfgCustomRtmpKey.value) : '';
    return { twitch, youtube, customUrl, customKey };
  }

  function setStreamError(message) {
    if (!message) {
      els.streamError.hidden = true;
      els.streamError.textContent = '';
      return;
    }
    els.streamError.hidden = false;
    els.streamError.textContent = message;
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function stopDurationTimer() {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = 0;
    }
    liveStartedAt = 0;
    if (els.streamDuration) els.streamDuration.textContent = '00:00:00';
  }

  function startDurationTimer() {
    stopDurationTimer();
    liveStartedAt = Date.now();
    durationTimer = window.setInterval(() => {
      if (els.streamDuration && liveStartedAt) {
        els.streamDuration.textContent = formatDuration(Date.now() - liveStartedAt);
      }
    }, 1000);
  }

  function stopMicMeter() {
    if (micMeterTimer) {
      clearInterval(micMeterTimer);
      micMeterTimer = 0;
    }
    if (els.micMeter) els.micMeter.style.width = micStream ? '22%' : '12%';
  }

  function startMicMeter() {
    stopMicMeter();
    if (!els.micMeter || !micStream) return;
    micMeterTimer = window.setInterval(() => {
      const level = 18 + Math.random() * 52;
      els.micMeter.style.width = `${level}%`;
    }, 350);
  }

  function setLiveUi(live) {
    if (els.streamLivePill) {
      els.streamLivePill.dataset.live = live ? 'true' : 'false';
      els.streamLivePill.textContent = live ? '● Live' : 'Offline';
    }
    if (els.streamViewers) {
      els.streamViewers.textContent = live ? '— viewers' : '— viewers';
    }
    const label = live ? 'End Streaming' : 'Start Streaming';
    if (els.btnGoLiveLabel) els.btnGoLiveLabel.textContent = label;
    if (els.btnGoLiveTop) {
      els.btnGoLiveTop.textContent = live ? 'End Live' : 'Go Live';
    }
    if (live) startDurationTimer();
    else stopDurationTimer();
  }

  function updateProgramStats(extra) {
    const profile = normalizeProfile(els.cfgProfile.value);
    const spec = profileSpec(profile);
    if (els.statFps) els.statFps.innerHTML = `<strong>FPS</strong> ${spec.fps}`;
    if (els.statResolution) {
      els.statResolution.innerHTML = `<strong>Resolution</strong> ${spec.width}×${spec.height}`;
    }
    if (els.statDropped) {
      els.statDropped.innerHTML = '<strong>Dropped</strong> 0 (0.0%)';
    }
    if (els.statHealth) {
      const warn = extra && /error|offline|orphan|fail/i.test(String(extra));
      els.statHealth.dataset.state = warn ? 'warn' : 'ok';
      els.statHealth.innerHTML = warn
        ? `<strong>Health</strong> ${extra}`
        : '<strong>Health</strong> OK';
    }
    if (els.streamTitle && activeSceneName()) {
      els.streamTitle.textContent = activeSceneName();
    }
  }

  function updateStatsLine(extra) {
    updateProgramStats(extra);
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
    if (els.relayChip) {
      const chipState =
        state === 'live' ? 'live' : state === 'ok' ? 'ready' : state === 'warn' ? 'error' : 'stopped';
      els.relayChip.dataset.state = chipState;
    }
    if (els.studioStatusDot) {
      els.studioStatusDot.dataset.state = state === 'warn' ? 'warn' : 'ok';
    }
    if (els.studioStatusText) {
      els.studioStatusText.textContent =
        state === 'live' ? 'Live on relay' : state === 'warn' ? 'Check relay / keys' : 'All systems nominal';
    }
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
    const { twitch, youtube, customUrl, customKey } = destinationInputsForConfig();
    if (twitch) body.twitchKey = twitch;
    else body.twitchKey = '';
    if (youtube) body.youtubeKey = youtube;
    else body.youtubeKey = '';
    if (customUrl && customKey) {
      body.customRtmpUrl = customUrl;
      body.customRtmpKey = customKey;
    } else {
      body.customRtmpUrl = '';
      body.customRtmpKey = '';
    }
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
    const { twitch, youtube, customUrl, customKey } = destinationInputsForConfig();
    const keysOk = validateRelayStreamKeys({
      twitchKey: twitch,
      youtubeKey: youtube,
      customRtmpUrl: customUrl,
      customRtmpKey: customKey,
      customEnabled: els.destCustom.checked,
    });
    if (!keysOk.ok) throw new Error(keysOk.message);

    await postRelayConfig();

    const res = await relayFetch(PATHS.verify, { method: 'POST' });
    if (!res.ok) throw new Error(`Verify HTTP ${res.status}`);
    const data = await res.json();
    const parts = [data.message || ''];
    if (data.twitch && data.twitch.ok === false) parts.push('Twitch verify failed');
    if (data.youtube && data.youtube.ok === false) parts.push('YouTube verify failed');
    if (data.custom && data.custom.ok === false) parts.push('Custom RTMP verify failed');
    const msg = data.ok ? 'Verify OK — ' + (data.message || '') : parts.filter(Boolean).join(' · ');
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
          label: activeSceneName(),
          x: 0,
          y: 0,
          width: w,
          height: h,
          zIndex: 0,
        },
      ],
    };
    if (screenStream && webcamStream) {
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
    })
      .then((res) => {
        if (res.ok) log(`POST /scene (${w}×${h}) — ${activeSceneName()}.`);
      })
      .catch(() => undefined);
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
    const live = Boolean(whipPublisher);
    els.btnStart.disabled = !hasCapture() || live;
    els.btnStop.disabled = !live;
    if (els.btnGoLiveTop) {
      els.btnGoLiveTop.disabled = !hasCapture() && !live;
    }
    setLiveUi(live);
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
      const { twitch, youtube, customUrl, customKey } = destinationInputsForConfig();
      const keysOk = validateRelayStreamKeys({
        twitchKey: twitch,
        youtubeKey: youtube,
        customRtmpUrl: customUrl,
        customRtmpKey: customKey,
        customEnabled: els.destCustom.checked,
      });
      if (!keysOk.ok) throw new Error(keysOk.message);

      await postRelayConfig();
      await postSceneLayout();
      log(`Publishing WHIP to ${RELAY_BASE}${PATHS.whip}…`);
      sessionLiveIntent = true;
      const publisher = await publishWhip(buildPublishSources());
      whipPublisher = publisher;
      publisher.pc.onconnectionstatechange = () => {
        if (whipPublisher !== publisher) return;
        log(`WHIP connection: ${publisher.pc.connectionState}`);
        if (publisher.pc.connectionState === 'connected') {
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
    stopMicMeter();
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      log('Microphone added.');
      startMicMeter();
    } catch (err) {
      log(`Mic denied: ${err instanceof Error ? err.message : err}`);
    }
    updateButtons();
  });

  els.btnStart.addEventListener('click', () => void onStart());
  els.btnStop.addEventListener('click', () => void onStop());
  els.btnGoLiveTop?.addEventListener('click', () => {
    if (whipPublisher) void onStop();
    else void onStart();
  });
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
      void postRelayConfig()
        .then(() => postSceneLayout())
        .catch((err) => log(err instanceof Error ? err.message : String(err)));
    }
  });
  els.destTwitch.addEventListener('change', syncDestinationInputs);
  els.destYoutube.addEventListener('change', syncDestinationInputs);
  els.destCustom.addEventListener('change', syncDestinationInputs);
  els.btnAddScene?.addEventListener('click', () => addScene());
  els.modalClose.addEventListener('click', () => {
    els.modal.hidden = true;
  });
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) els.modal.hidden = true;
  });

  window.addEventListener('resize', resizeCanvas);
  syncDestinationInputs();
  renderSceneList();
  drawFrame();
  void probeRelay();
  updateButtons();
  updateProgramStats();
  log('Maka web studio — connect relay → configure → go live (see docs/web-relay.md).');
})();
