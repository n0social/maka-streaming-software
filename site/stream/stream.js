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
    statLatency: document.getElementById('stat-latency'),
    statResolution: document.getElementById('stat-resolution-text'),
    statHealth: document.getElementById('stat-health'),
    streamLivePill: document.getElementById('stream-live-pill'),
    streamTitle: document.getElementById('stream-title'),
    streamCategory: document.getElementById('stream-category'),
    streamDuration: document.getElementById('stream-duration'),
    micMeter: document.getElementById('mic-meter'),
    desktopMeter: document.getElementById('desktop-meter'),
    faderDesktop: document.getElementById('fader-desktop'),
    faderMic: document.getElementById('fader-mic'),
    programSceneName: document.getElementById('program-scene-name'),
    btnRecord: document.getElementById('btn-record'),
    overlayFile: document.getElementById('overlay-file'),
    studioStatusDot: document.getElementById('studio-status-dot'),
    studioStatusText: document.getElementById('studio-status-text'),
    programScreen: document.getElementById('program-screen'),
    settings: document.getElementById('studio-settings'),
    btnSettings: document.getElementById('btn-settings'),
    btnSettingsClose: document.getElementById('btn-settings-close'),
    btnOverlay: document.getElementById('btn-overlay'),
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
    { id: 'scene-gameplay', name: 'Gameplay', iconKind: 'gameplay' },
    { id: 'scene-starting', name: 'Starting Soon', iconKind: 'starting' },
    { id: 'scene-chatting', name: 'Just Chatting', iconKind: 'chatting' },
    { id: 'scene-intermission', name: 'Intermission', iconKind: 'intermission' },
    { id: 'scene-ending', name: 'Ending Scene', iconKind: 'ending' },
  ];

  /** @type {{ id: string, name: string, iconKind?: string }[]} */
  let scenes = DEFAULT_SCENES.map((s) => ({ ...s }));
  let activeSceneId = 'scene-gameplay';
  let liveStartedAt = 0;
  let durationTimer = 0;
  let statsTimer = 0;
  let meterTimer = 0;
  let overlayImage = null;
  let overlayUrl = '';
  let recorder = null;
  let recordedChunks = [];
  let canvasCapture = null;
  let publishBusy = false;
  let stopBusy = false;
  let recordBusy = false;
  let recordStartedAt = 0;
  let endingLive = false;
  let pageUnloading = false;
  let activeError = '';
  let relayFooterState = 'pending';
  let sceneFlushing = false;
  let sceneDirty = false;
  const sourceBusy = { screen: false, webcam: false, mic: false };

  const STORAGE = {
    scenes: 'maka.studio.scenes',
    info: 'maka.studio.info',
    setup: 'maka.studio.setup',
    gains: 'maka.studio.gains',
  };

  const audio = {
    ctx: null,
    desktopGain: null,
    micGain: null,
    desktopAnalyser: null,
    micAnalyser: null,
    mixDest: null,
    desktopSource: null,
    micSource: null,
  };

  function sceneIconSvg(kind) {
    const common =
      'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths = {
      gameplay:
        '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 15.5 10.4 12l2 2.2L15.6 10 18 14.5"/>',
      starting: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>',
      chatting:
        '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M10 9.2v5.6l5.2-2.8z" fill="currentColor" stroke="none"/>',
      intermission: '<circle cx="12" cy="12" r="7"/><path d="M12 9v3.5l2.2 1.4"/>',
      ending: '<path d="M7 4.5h8.5a2 2 0 0 1 2 2V19l-4.2-2.2L9.2 19V6.5a2 2 0 0 1 2-2z"/>',
      custom: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M12 8.5v7M8.5 12h7"/>',
    };
    return `<svg ${common}>${paths[kind] || paths.custom}</svg>`;
  }

  function activeSceneName() {
    return scenes.find((s) => s.id === activeSceneId)?.name ?? 'Gameplay';
  }

  function updateProgramLabel() {
    if (els.programSceneName) els.programSceneName.textContent = activeSceneName();
  }

  function readStorage(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota */
    }
  }

  function loadScenes() {
    const data = readStorage(STORAGE.scenes);
    if (!data || !Array.isArray(data.scenes)) return;
    const next = data.scenes
      .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && s.name.trim())
      .map((s) => ({
        id: s.id,
        name: s.name.trim(),
        iconKind: typeof s.iconKind === 'string' ? s.iconKind : 'custom',
      }));
    if (!next.length) return;
    scenes = next;
    if (typeof data.activeSceneId === 'string' && scenes.some((s) => s.id === data.activeSceneId)) {
      activeSceneId = data.activeSceneId;
    } else {
      activeSceneId = scenes[0].id;
    }
  }

  function saveScenes() {
    writeStorage(STORAGE.scenes, { scenes, activeSceneId });
  }

  function renderSceneList() {
    if (!els.sceneList) return;
    els.sceneList.replaceChildren();
    for (const scene of scenes) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'studio-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item' + (scene.id === activeSceneId ? ' is-on' : '');
      const icon = document.createElement('span');
      icon.className = 'scene-icon';
      icon.innerHTML = sceneIconSvg(scene.iconKind || 'custom');
      btn.appendChild(icon);
      btn.appendChild(document.createTextNode(scene.name));
      btn.setAttribute('aria-current', scene.id === activeSceneId ? 'true' : 'false');
      btn.addEventListener('click', () => {
        void switchScene(scene.id);
      });
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'studio-row-menu';
      menu.tabIndex = -1;
      menu.setAttribute('aria-hidden', 'true');
      menu.textContent = '•••';
      row.append(btn, menu);
      li.appendChild(row);
      els.sceneList.appendChild(li);
    }
    const addLi = document.createElement('li');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'studio-list-add';
    addBtn.id = 'btn-add-scene-alt';
    const addIcon = document.createElement('span');
    addIcon.className = 'add-plus';
    addIcon.setAttribute('aria-hidden', 'true');
    addIcon.textContent = '+';
    addBtn.appendChild(addIcon);
    addBtn.appendChild(document.createTextNode(' Add Scene'));
    addBtn.addEventListener('click', () => addScene());
    addLi.appendChild(addBtn);
    els.sceneList.appendChild(addLi);
    updateProgramLabel();
  }

  async function switchScene(sceneId) {
    if (!scenes.some((s) => s.id === sceneId) || sceneId === activeSceneId) return;
    activeSceneId = sceneId;
    saveScenes();
    renderSceneList();
    log(`Active scene: ${activeSceneName()}.`);
    sceneDirty = true;
    try {
      await flushScenePost();
    } catch (err) {
      log(`Scene update failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function flushScenePost() {
    if (sceneFlushing || !relayHealth) return;
    sceneFlushing = true;
    try {
      while (sceneDirty && relayHealth) {
        sceneDirty = false;
        await postSceneLayout();
      }
    } finally {
      sceneFlushing = false;
      if (sceneDirty && relayHealth) {
        void flushScenePost().catch((err) => {
          log(`Scene update failed: ${err instanceof Error ? err.message : err}`);
        });
      }
    }
  }

  function addScene() {
    const n = scenes.filter((s) => !DEFAULT_SCENES.some((d) => d.id === s.id)).length + 1;
    const id = `scene-custom-${Date.now()}`;
    scenes.push({ id, name: `Scene ${n}`, iconKind: 'custom' });
    saveScenes();
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

  function applyFooter() {
    if (els.studioStatusDot) {
      els.studioStatusDot.dataset.state = activeError
        ? 'warn'
        : relayFooterState === 'warn'
          ? 'warn'
          : relayFooterState === 'pending'
            ? 'pending'
            : 'ok';
    }
    if (els.studioStatusText) {
      els.studioStatusText.textContent = activeError
        ? activeError
        : relayFooterState === 'live'
          ? 'Live on relay'
          : relayFooterState === 'warn'
            ? 'Check relay / keys'
            : relayFooterState === 'pending'
              ? 'Checking relay…'
              : 'All systems nominal';
    }
  }

  function setStreamError(message) {
    activeError = message ? String(message) : '';
    if (els.streamError) {
      els.streamError.hidden = !activeError;
      els.streamError.textContent = activeError;
    }
    applyFooter();
  }

  function clearSourcePrompt() {
    if (/before going live|before recording/i.test(activeError)) setStreamError(null);
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
    if (els.streamDuration) els.streamDuration.textContent = '—';
  }

  function startDurationTimer() {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = 0;
    }
    liveStartedAt = Date.now();
    if (els.streamDuration) els.streamDuration.textContent = '00:00:00';
    durationTimer = window.setInterval(() => {
      if (els.streamDuration && liveStartedAt) {
        els.streamDuration.textContent = formatDuration(Date.now() - liveStartedAt);
      }
    }, 1000);
  }

  function setLiveUi(live) {
    const label = live ? 'End Live' : 'Go Live';
    if (els.btnGoLiveLabel) els.btnGoLiveLabel.textContent = label;
    if (els.btnStart) els.btnStart.classList.toggle('is-live', live);
    if (els.btnGoLiveTop) els.btnGoLiveTop.textContent = label;
    if (els.streamLivePill) {
      els.streamLivePill.dataset.live = live ? 'true' : 'false';
      els.streamLivePill.textContent = live ? 'Live' : 'Offline';
    }
    if (live) {
      if (!durationTimer) startDurationTimer();
      startLiveStats();
    } else {
      stopDurationTimer();
      stopLiveStats();
      showOfflineStats();
    }
  }

  function selectedProfileSpec() {
    return profileSpec(normalizeProfile(els.cfgProfile && els.cfgProfile.value));
  }

  function showOfflineStats() {
    const spec = selectedProfileSpec();
    if (els.statDropped) els.statDropped.textContent = 'Dropped Frames: 0 (0.0%)';
    if (els.statFps) els.statFps.textContent = 'FPS: 0';
    if (els.statLatency) els.statLatency.textContent = '0 ms';
    if (els.statResolution) els.statResolution.textContent = `${spec.width}×${spec.height}`;
  }

  function captureResolution() {
    const stream = videoLive(screenStream) ? screenStream : webcamStream;
    const track = stream?.getVideoTracks?.()[0];
    if (!track || track.readyState !== 'live') return null;
    const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    const width = Number(settings.width);
    const height = Number(settings.height);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  function applyResolutionText(width, height, live) {
    if (!els.statResolution) return;
    if (width > 0 && height > 0) {
      els.statResolution.textContent = `${Math.round(width)}×${Math.round(height)}`;
      return;
    }
    if (live) {
      els.statResolution.textContent = '—';
      return;
    }
    const spec = selectedProfileSpec();
    els.statResolution.textContent = `${spec.width}×${spec.height}`;
  }

  async function readLiveStats() {
    const publisher = whipPublisher;
    if (!publisher?.pc) {
      showOfflineStats();
      return;
    }
    const sourceSize = captureResolution();
    let fps = null;
    let dropped = null;
    let framesSent = null;
    let width = sourceSize ? sourceSize.width : null;
    let height = sourceSize ? sourceSize.height : null;
    let rttMs = null;
    try {
      const report = await publisher.pc.getStats();
      report.forEach((stat) => {
        if (!stat || typeof stat !== 'object') return;
        const kind = stat.kind || stat.mediaType;
        if ((stat.type === 'outbound-rtp' || stat.type === 'media-source' || stat.type === 'track') && kind === 'video') {
          if (typeof stat.framesPerSecond === 'number') fps = stat.framesPerSecond;
          if (typeof stat.framesDropped === 'number') dropped = stat.framesDropped;
          if (typeof stat.framesSent === 'number') framesSent = stat.framesSent;
          if (typeof stat.frameWidth === 'number' && stat.frameWidth > 0) width = stat.frameWidth;
          if (typeof stat.frameHeight === 'number' && stat.frameHeight > 0) height = stat.frameHeight;
          if (typeof stat.width === 'number' && stat.width > 0) width = stat.width;
          if (typeof stat.height === 'number' && stat.height > 0) height = stat.height;
        }
        if (stat.type === 'remote-inbound-rtp' && kind === 'video' && typeof stat.roundTripTime === 'number') {
          rttMs = Math.round(stat.roundTripTime * 1000);
        }
      });
    } catch {
      /* stats not available yet */
    }
    if (whipPublisher !== publisher) return;
    if (sourceSize) {
      width = sourceSize.width;
      height = sourceSize.height;
    }
    applyResolutionText(width, height, true);
    if (els.statFps) els.statFps.textContent = typeof fps === 'number' ? `FPS: ${Math.round(fps)}` : 'FPS: —';
    if (els.statDropped) {
      if (typeof dropped === 'number') {
        const sent = typeof framesSent === 'number' ? framesSent : 0;
        const total = dropped + sent;
        const pct = total > 0 ? (dropped / total) * 100 : 0;
        els.statDropped.textContent = `Dropped Frames: ${Math.round(dropped)} (${pct.toFixed(1)}%)`;
      } else {
        els.statDropped.textContent = 'Dropped Frames: —';
      }
    }
    if (els.statLatency) els.statLatency.textContent = typeof rttMs === 'number' ? `${rttMs} ms` : '—';
  }

  function startLiveStats() {
    if (statsTimer) return;
    void readLiveStats();
    statsTimer = window.setInterval(() => void readLiveStats(), 1000);
  }

  function stopLiveStats() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = 0;
    }
  }

  function updateProgramStats() {
    if (whipPublisher) return;
    showOfflineStats();
  }

  function updateStatsLine(extra) {
    updateProgramStats(extra);
  }

  function log(line) {
    if (!els.log) return;
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    els.log.textContent = (els.log.textContent ? els.log.textContent + '\n' : '') + `[${ts}] ${line}`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function logError(line) {
    log(line);
    setStreamError(line);
  }

  function setRelayStatus(state, text) {
    if (els.statusDot) els.statusDot.dataset.state = state;
    if (els.statusText) els.statusText.textContent = text;
    if (els.relayChip) {
      const chipState =
        state === 'live' ? 'live' : state === 'ok' ? 'ready' : state === 'warn' ? 'error' : 'stopped';
      els.relayChip.dataset.state = chipState;
    }
    relayFooterState = state === 'live' || state === 'warn' || state === 'ok' ? state : 'pending';
    if (state === 'live') setStreamError(null);
    else applyFooter();
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
    const sceneName = activeSceneName();
    const layout = {
      name: sceneName,
      canvas: { width: w, height: h },
      sources: [
        {
          id: 'gameplay',
          type: 'video',
          label: sceneName,
          x: 0,
          y: 0,
          width: w,
          height: h,
          zIndex: 0,
        },
      ],
    };
    if (videoLive(screenStream) && videoLive(webcamStream)) {
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
    let res;
    try {
      res = await relayFetch(PATHS.scene, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      });
    } catch (err) {
      log(`Scene update failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    if (!res.ok) {
      log(`Scene update failed (HTTP ${res.status}).`);
      return;
    }
    log(`POST /scene (${w}×${h}) — ${sceneName}.`);
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
  function drawVideo(stream, dx, dy, dw, dh, mode) {
    let video = videoEls.get(stream);
    if (!video) {
      video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.style.background = '#ffffff';
      videoEls.set(stream, video);
      video.play().catch(() => undefined);
    }
    if (video.readyState < 2) return;
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    if (mode === 'cover') {
      const scale = Math.max(dw / vw, dh / vh);
      const sw = dw / scale;
      const sh = dh / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    const scale = Math.min(dw / vw, dh / vh);
    const tw = vw * scale;
    const th = vh * scale;
    ctx.drawImage(video, dx + (dw - tw) / 2, dy + (dh - th) / 2, tw, th);
  }

  function drawOverlay(w, h, alone) {
    if (!overlayImage) return;
    const iw = overlayImage.naturalWidth || overlayImage.width || 16;
    const ih = overlayImage.naturalHeight || overlayImage.height || 9;
    const maxW = alone ? w - 32 : Math.round(w * 0.28);
    const maxH = alone ? h - 32 : Math.round(h * 0.28);
    const scale = Math.min(maxW / iw, maxH / ih);
    const tw = iw * scale;
    const th = ih * scale;
    const x = alone ? (w - tw) / 2 : 16;
    const y = alone ? (h - th) / 2 : 16;
    ctx.drawImage(overlayImage, x, y, tw, th);
  }

  function drawFrame() {
    if (!ctx || !els.canvas) return;
    if (videoEnded(screenStream)) releaseScreen();
    if (videoEnded(webcamStream)) releaseWebcam();
    if (audioEnded(micStream)) releaseMic();
    resizeCanvas();
    const w = els.canvas.width;
    const h = els.canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const screenOn = videoLive(screenStream);
    const webcamOn = videoLive(webcamStream);
    const hasVideo = screenOn || webcamOn;
    const livePreview = hasVideo || Boolean(overlayImage);
    if (els.programScreen) els.programScreen.classList.toggle('is-live-preview', livePreview);
    if (els.empty) els.empty.hidden = livePreview;
    if (screenOn) drawVideo(screenStream, 0, 0, w, h, 'contain');
    else if (webcamOn) drawVideo(webcamStream, 0, 0, w, h, 'contain');
    if (screenOn && webcamOn) {
      const pipW = Math.round(w * 0.22);
      const pipH = Math.round(pipW * (9 / 16));
      const x = w - pipW - 16;
      const y = h - pipH - 16;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2, y - 2, pipW + 4, pipH + 4);
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 2, y - 2, pipW + 4, pipH + 4);
      drawVideo(webcamStream, x, y, pipW, pipH, 'cover');
    }
    if (overlayImage) drawOverlay(w, h, !hasVideo);
    paintSourceButtons();
    requestAnimationFrame(drawFrame);
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    const v = videoEls.get(stream);
    if (v) {
      v.srcObject = null;
      videoEls.delete(stream);
    }
  }

  function disconnectAudioNode(node) {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  function gainFromFader(input) {
    const n = Number(input && input.value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(1, Math.max(0, n / 100));
  }

  function ensureAudioGraph() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') void audio.ctx.resume();
      return audio.ctx;
    }
    const ctx = new AudioContext();
    audio.ctx = ctx;
    audio.desktopGain = ctx.createGain();
    audio.micGain = ctx.createGain();
    audio.desktopAnalyser = ctx.createAnalyser();
    audio.micAnalyser = ctx.createAnalyser();
    audio.desktopAnalyser.fftSize = 2048;
    audio.micAnalyser.fftSize = 2048;
    audio.mixDest = ctx.createMediaStreamDestination();
    audio.desktopGain.connect(audio.desktopAnalyser);
    audio.micGain.connect(audio.micAnalyser);
    audio.desktopGain.connect(audio.mixDest);
    audio.micGain.connect(audio.mixDest);
    applyGains();
    startMeterLoop();
    return ctx;
  }

  // Fader value 100 is unity gain (0 dB on the mixer scale) and is the default.
  // 0 is mute. Display/tab audio and the microphone start at unity, not muted.
  function applyGains() {
    const desktop = gainFromFader(els.faderDesktop);
    const mic = gainFromFader(els.faderMic);
    if (audio.desktopGain) audio.desktopGain.gain.value = desktop;
    if (audio.micGain) audio.micGain.gain.value = mic;
  }

  function onFader() {
    saveGains();
    if (audio.ctx) applyGains();
  }

  function saveGains() {
    writeStorage(STORAGE.gains, {
      desktop: Number(els.faderDesktop && els.faderDesktop.value),
      mic: Number(els.faderMic && els.faderMic.value),
    });
  }

  function loadGains() {
    const data = readStorage(STORAGE.gains);
    if (!data) return;
    const set = (input, value) => {
      if (!input || typeof value !== 'number' || !Number.isFinite(value)) return;
      input.value = String(Math.min(100, Math.max(0, value)));
    };
    set(els.faderDesktop, data.desktop);
    set(els.faderMic, data.mic);
  }

  function meterPercent(analyser) {
    if (!analyser) return 0;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    if (rms < 0.001) return 0;
    const db = 20 * Math.log10(rms);
    return Math.max(0, Math.min(100, ((db + 30) / 30) * 100));
  }

  function setMeter(el, percent) {
    if (!el) return;
    el.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function startMeterLoop() {
    if (meterTimer) return;
    meterTimer = window.setInterval(() => {
      const desktopLive = Boolean(
        screenStream && screenStream.getAudioTracks().some((t) => t.readyState === 'live'),
      );
      const micLive = Boolean(micStream && micStream.getAudioTracks().some((t) => t.readyState === 'live'));
      setMeter(els.desktopMeter, desktopLive ? meterPercent(audio.desktopAnalyser) : 0);
      setMeter(els.micMeter, micLive ? meterPercent(audio.micAnalyser) : 0);
    }, 100);
  }

  function attachDisplayAudio(stream) {
    disconnectAudioNode(audio.desktopSource);
    audio.desktopSource = null;
    const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
    if (!tracks.length) return;
    const ctx = ensureAudioGraph();
    audio.desktopSource = ctx.createMediaStreamSource(new MediaStream(tracks));
    audio.desktopSource.connect(audio.desktopGain);
    applyGains();
  }

  function detachDisplayAudio() {
    disconnectAudioNode(audio.desktopSource);
    audio.desktopSource = null;
    setMeter(els.desktopMeter, 0);
  }

  function attachMicAudio(stream) {
    disconnectAudioNode(audio.micSource);
    audio.micSource = null;
    const track = stream.getAudioTracks().find((t) => t.readyState === 'live');
    if (!track) return;
    const ctx = ensureAudioGraph();
    audio.micSource = ctx.createMediaStreamSource(new MediaStream([track]));
    audio.micSource.connect(audio.micGain);
    applyGains();
  }

  function detachMicAudio() {
    disconnectAudioNode(audio.micSource);
    audio.micSource = null;
    setMeter(els.micMeter, 0);
  }

  function liveAudioTracks() {
    const tracks = [];
    if (screenStream) tracks.push(...screenStream.getAudioTracks().filter((t) => t.readyState === 'live'));
    if (micStream) tracks.push(...micStream.getAudioTracks().filter((t) => t.readyState === 'live'));
    return tracks;
  }

  function mixedAudioStream() {
    if (!liveAudioTracks().length) return null;
    ensureAudioGraph();
    return audio.mixDest.stream;
  }

  function programCanvasStream() {
    if (!canvasCapture) {
      const fps = Math.min(60, selectedProfileSpec().fps || 30);
      canvasCapture = els.canvas.captureStream(fps);
    }
    return canvasCapture;
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
    try {
      attachWhipSources(pc, sources);
      preferH264VideoCodecs(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc, 5000);
      const sdp = pc.localDescription && pc.localDescription.sdp;
      if (!sdp) throw new Error('Empty WHIP offer');
      const response = await fetch(`${RELAY_BASE}${PATHS.whip}`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/sdp', ...authHeaders() },
        body: sdp,
      });
      if (!response.ok) {
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
          try {
            pc.close();
          } catch {
            /* already closed */
          }
          if (resourceUrl) {
            try {
              await fetch(resourceUrl, { method: 'DELETE', headers: authHeaders(), keepalive: true });
            } catch {
              /* ignore */
            }
          }
        },
      };
    } catch (err) {
      try {
        pc.close();
      } catch {
        /* already closed */
      }
      throw err;
    }
  }

  function buildPublishSources() {
    const canvasStream = programCanvasStream();
    const gameplay = namedStream(TRACK_IDS.gameplay, canvasStream.getVideoTracks());
    let webcam = null;
    if (videoLive(screenStream) && videoLive(webcamStream)) {
      webcam = namedStream(TRACK_IDS.webcam, webcamStream.getVideoTracks());
    }
    let mic = null;
    // Desktop and mic audio are mixed through the fader gains and published
    // on the existing `mic` WHIP stream id. The relay contract is unchanged.
    const mix = mixedAudioStream();
    if (mix && mix.getAudioTracks()[0]) {
      mic = namedStream(TRACK_IDS.mic, mix.getAudioTracks());
    }
    return { gameplay, webcam, mic };
  }

  function videoLive(stream) {
    return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));
  }

  function audioLive(stream) {
    return Boolean(stream && stream.getAudioTracks().some((t) => t.readyState === 'live'));
  }

  function videoEnded(stream) {
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    return tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
  }

  function audioEnded(stream) {
    if (!stream) return false;
    const tracks = stream.getAudioTracks();
    return tracks.length > 0 && tracks.every((t) => t.readyState === 'ended');
  }

  function hasCapture() {
    return videoLive(screenStream) || videoLive(webcamStream) || Boolean(overlayImage);
  }

  function paintSourceButtons() {
    if (els.btnScreen) els.btnScreen.classList.toggle('is-on', videoLive(screenStream));
    if (els.btnWebcam) els.btnWebcam.classList.toggle('is-on', videoLive(webcamStream));
    if (els.btnMic) els.btnMic.classList.toggle('is-on', audioLive(micStream));
    if (els.btnOverlay) els.btnOverlay.classList.toggle('is-on', Boolean(overlayImage));
  }

  function updateButtons() {
    const live = Boolean(whipPublisher);
    if (els.btnStop) els.btnStop.disabled = !live || publishBusy;
    if (els.btnStart) els.btnStart.disabled = publishBusy || stopBusy;
    paintSourceButtons();
    setLiveUi(live);
  }

  function permissionMessage(err, cancelledText, failedText) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'AbortError') return { cancelled: true, message: cancelledText };
    return {
      cancelled: false,
      message: `${failedText}: ${err instanceof Error ? err.message : err}`,
    };
  }

  async function onStart() {
    if (publishBusy || whipPublisher) return;
    if (!hasCapture()) {
      logError('Add a game capture, webcam, or overlay before going live.');
      return;
    }
    publishBusy = true;
    if (els.btnGoLiveLabel) els.btnGoLiveLabel.textContent = 'Starting…';
    if (els.btnStart) els.btnStart.disabled = true;
    try {
      const ok = relayHealth ? true : await probeRelay();
      if (!ok) {
        if (els.modal) els.modal.hidden = false;
        return;
      }
      if (els.modal) els.modal.hidden = true;
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
      if (!sessionLiveIntent) {
        await publisher.close().catch(() => undefined);
        return;
      }
      whipPublisher = publisher;
      publisher.pc.onconnectionstatechange = () => {
        if (whipPublisher !== publisher || endingLive) return;
        const state = publisher.pc.connectionState;
        log(`WHIP connection: ${state}`);
        if (state === 'connected') {
          setRelayStatus('live', 'Live via relay');
          void refreshRelayStatus();
          return;
        }
        if (state === 'failed' || state === 'disconnected') {
          logError(`WHIP connection ${state}. Ended the live session.`);
          void onStop();
        }
      };
      setRelayStatus('live', 'Live via relay');
      log('WHIP active — check relay /status for pipeline state.');
      await refreshRelayStatus();
    } catch (err) {
      sessionLiveIntent = false;
      endingLive = true;
      const failed = whipPublisher;
      whipPublisher = null;
      if (failed) await failed.close().catch(() => undefined);
      endingLive = false;
      logError(`Go live failed: ${err instanceof Error ? err.message : err}`);
      if (!relayHealth && els.modal) els.modal.hidden = false;
      else openSettings();
    } finally {
      publishBusy = false;
      if (els.btnStart) els.btnStart.disabled = false;
      updateButtons();
    }
  }

  async function onStop() {
    if (stopBusy) return;
    stopBusy = true;
    endingLive = true;
    sessionLiveIntent = false;
    const publisher = whipPublisher;
    whipPublisher = null;
    try {
      if (publisher) await publisher.close().catch(() => undefined);
      await postRelayStop();
      if (relayHealth) setRelayStatus('ok', `Relay v${relayHealth.version ?? '?'}`);
      await refreshRelayStatus();
      log('Stream stopped.');
    } finally {
      endingLive = false;
      stopBusy = false;
      updateButtons();
    }
  }

  function releaseScreen() {
    detachDisplayAudio();
    stopStream(screenStream);
    screenStream = null;
  }

  function releaseWebcam() {
    stopStream(webcamStream);
    webcamStream = null;
  }

  function releaseMic() {
    detachMicAudio();
    stopStream(micStream);
    micStream = null;
    setMeter(els.micMeter, 0);
  }

  function clearOverlay() {
    overlayImage = null;
    if (overlayUrl) {
      URL.revokeObjectURL(overlayUrl);
      overlayUrl = '';
    }
  }

  async function captureDisplay() {
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'AbortError') throw err;
      return navigator.mediaDevices.getDisplayMedia({ video: true });
    }
  }

  els.btnWebcam?.addEventListener('click', async () => {
    if (sourceBusy.webcam) return;
    if (videoLive(webcamStream)) {
      releaseWebcam();
      log('Webcam stopped.');
      updateButtons();
      return;
    }
    sourceBusy.webcam = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      releaseWebcam();
      webcamStream = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          if (webcamStream !== stream) return;
          releaseWebcam();
          log('Webcam ended.');
          updateButtons();
        };
      }
      log('Webcam added.');
      clearSourcePrompt();
    } catch (err) {
      releaseWebcam();
      const result = permissionMessage(err, 'Webcam cancelled.', 'Webcam failed');
      if (result.cancelled) log(result.message);
      else logError(result.message);
    } finally {
      sourceBusy.webcam = false;
      updateButtons();
    }
  });

  els.btnScreen?.addEventListener('click', async () => {
    if (sourceBusy.screen) return;
    if (videoLive(screenStream)) {
      releaseScreen();
      log('Game capture stopped.');
      updateButtons();
      return;
    }
    sourceBusy.screen = true;
    ensureAudioGraph();
    try {
      const stream = await captureDisplay();
      releaseScreen();
      screenStream = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (screenStream !== stream) return;
          releaseScreen();
          log('Game capture ended.');
          updateButtons();
        };
      }
      attachDisplayAudio(stream);
      const audioCount = stream.getAudioTracks().filter((t) => t.readyState === 'live').length;
      log(
        audioCount
          ? `Game capture started (${audioCount} audio track${audioCount === 1 ? '' : 's'}).`
          : 'Game capture started (no audio shared).',
      );
      clearSourcePrompt();
    } catch (err) {
      releaseScreen();
      const result = permissionMessage(err, 'Game capture cancelled.', 'Game capture failed');
      if (result.cancelled) log(result.message);
      else logError(result.message);
    } finally {
      sourceBusy.screen = false;
      updateButtons();
    }
  });

  els.btnMic?.addEventListener('click', async () => {
    if (sourceBusy.mic) return;
    if (audioLive(micStream)) {
      releaseMic();
      log('Microphone stopped.');
      updateButtons();
      return;
    }
    sourceBusy.mic = true;
    ensureAudioGraph();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      releaseMic();
      micStream = stream;
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          if (micStream !== stream) return;
          releaseMic();
          log('Microphone ended.');
          updateButtons();
        };
      }
      attachMicAudio(stream);
      log('Microphone added.');
    } catch (err) {
      releaseMic();
      const result = permissionMessage(err, 'Microphone cancelled.', 'Microphone failed');
      if (result.cancelled) log(result.message);
      else logError(result.message);
    } finally {
      sourceBusy.mic = false;
      updateButtons();
    }
  });

  function setRecordingUi(on) {
    if (!els.btnRecord) return;
    els.btnRecord.classList.toggle('is-recording', on);
    els.btnRecord.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = els.btnRecord.querySelector('[data-record-label]');
    if (label) label.textContent = on ? 'Stop Recording' : 'Start Recording';
  }

  function recordingStream() {
    const canvasStream = programCanvasStream();
    const tracks = canvasStream.getVideoTracks().filter((t) => t.readyState === 'live');
    const mix = mixedAudioStream();
    if (mix) tracks.push(...mix.getAudioTracks().filter((t) => t.readyState === 'live'));
    return new MediaStream(tracks);
  }

  function downloadRecording(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `maka-recording-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  els.btnRecord?.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') {
      if (Date.now() - recordStartedAt < 500) return;
      recorder.stop();
      return;
    }
    if (recordBusy) return;
    if (typeof MediaRecorder === 'undefined') {
      logError('Recording is not available in this browser.');
      return;
    }
    if (!hasCapture()) {
      logError('Add a game capture, webcam, or overlay before recording.');
      return;
    }
    recordBusy = true;
    let stream;
    try {
      stream = recordingStream();
    } catch (err) {
      recordBusy = false;
      logError(`Recording failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    if (!stream.getVideoTracks().length) {
      recordBusy = false;
      logError('Program canvas is not ready to record.');
      return;
    }
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    let mimeType = '';
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }
    try {
      recordedChunks = [];
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      recorder = null;
      recordBusy = false;
      logError(`Recording failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) recordedChunks.push(event.data);
    };
    recorder.onstop = () => {
      recordBusy = false;
      const type = (recorder && recorder.mimeType) || 'video/webm';
      const blob = new Blob(recordedChunks, { type });
      recordedChunks = [];
      setRecordingUi(false);
      if (pageUnloading) return;
      if (!blob.size) {
        logError('Recording was empty. Nothing was downloaded.');
        return;
      }
      downloadRecording(blob);
      log('Recording saved as WebM.');
    };
    recorder.onerror = (event) => {
      recordBusy = false;
      setRecordingUi(false);
      const detail = event && event.error && event.error.message ? event.error.message : 'Recording failed.';
      logError(detail);
    };
    try {
      recorder.start(250);
      recordStartedAt = Date.now();
    } catch (err) {
      recordBusy = false;
      recorder = null;
      setRecordingUi(false);
      logError(`Recording failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    setRecordingUi(true);
    log('Recording started.');
  });

  els.btnStart.addEventListener('click', () => {
    if (whipPublisher) void onStop();
    else void onStart();
  });
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
  function saveSetup() {
    writeStorage(STORAGE.setup, {
      profile: els.cfgProfile.value,
      twitch: els.destTwitch.checked,
      youtube: els.destYoutube.checked,
      custom: els.destCustom.checked,
      twitchKey: els.cfgTwitchKey.value,
      youtubeKey: els.cfgYoutubeKey.value,
      customUrl: els.cfgCustomRtmpUrl.value,
      customKey: els.cfgCustomRtmpKey.value,
    });
  }

  function loadSetup() {
    const data = readStorage(STORAGE.setup);
    if (!data || typeof data !== 'object') return;
    if (data.profile && Object.prototype.hasOwnProperty.call(ENCODE_PROFILES, data.profile)) {
      els.cfgProfile.value = data.profile;
    }
    els.destTwitch.checked = Boolean(data.twitch);
    els.destYoutube.checked = Boolean(data.youtube);
    els.destCustom.checked = Boolean(data.custom);
    if (typeof data.twitchKey === 'string') els.cfgTwitchKey.value = data.twitchKey;
    if (typeof data.youtubeKey === 'string') els.cfgYoutubeKey.value = data.youtubeKey;
    if (typeof data.customUrl === 'string') els.cfgCustomRtmpUrl.value = data.customUrl;
    if (typeof data.customKey === 'string') els.cfgCustomRtmpKey.value = data.customKey;
  }

  function saveInfo() {
    writeStorage(STORAGE.info, {
      title: els.streamTitle && 'value' in els.streamTitle ? els.streamTitle.value : '',
      category: els.streamCategory && 'value' in els.streamCategory ? els.streamCategory.value : '',
    });
  }

  function loadInfo() {
    const data = readStorage(STORAGE.info);
    if (!data || typeof data !== 'object') return;
    if (els.streamTitle && typeof data.title === 'string') els.streamTitle.value = data.title;
    if (els.streamCategory && typeof data.category === 'string') els.streamCategory.value = data.category;
  }

  els.cfgProfile.addEventListener('change', () => {
    saveSetup();
    updateStatsLine();
    if (relayHealth) {
      void postRelayConfig()
        .then(() => postSceneLayout())
        .catch((err) => log(err instanceof Error ? err.message : String(err)));
    }
  });
  function onDestinationChange() {
    syncDestinationInputs();
    saveSetup();
  }
  els.destTwitch.addEventListener('change', onDestinationChange);
  els.destYoutube.addEventListener('change', onDestinationChange);
  els.destCustom.addEventListener('change', onDestinationChange);
  [els.cfgTwitchKey, els.cfgYoutubeKey, els.cfgCustomRtmpUrl, els.cfgCustomRtmpKey].forEach((input) => {
    input?.addEventListener('change', saveSetup);
    input?.addEventListener('input', saveSetup);
  });
  els.btnAddScene?.addEventListener('click', () => addScene());
  els.btnOverlay?.addEventListener('click', () => {
    if (overlayImage) {
      clearOverlay();
      log('Overlay removed.');
      updateButtons();
      return;
    }
    if (!els.overlayFile) {
      log('Overlay image picker is unavailable.');
      return;
    }
    els.overlayFile.click();
  });
  els.overlayFile?.addEventListener('change', () => {
    const file = els.overlayFile.files && els.overlayFile.files[0];
    els.overlayFile.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      logError('Overlay needs an image file.');
      updateButtons();
      return;
    }
    clearOverlay();
    overlayUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      overlayImage = img;
      log('Overlay image drawn on the program.');
      clearSourcePrompt();
      updateButtons();
    };
    img.onerror = () => {
      clearOverlay();
      logError('Could not read that overlay image.');
      updateButtons();
    };
    img.src = overlayUrl;
  });
  els.faderDesktop?.addEventListener('input', () => onFader());
  els.faderMic?.addEventListener('input', () => onFader());
  els.streamTitle?.addEventListener('input', saveInfo);
  els.streamCategory?.addEventListener('input', saveInfo);
  function openSettings() {
    if (!els.settings) return;
    els.settings.hidden = false;
  }
  function closeSettings() {
    if (!els.settings) return;
    els.settings.hidden = true;
  }
  els.btnSettings?.addEventListener('click', openSettings);
  els.btnSettingsClose?.addEventListener('click', closeSettings);
  els.settings?.addEventListener('click', (e) => {
    if (e.target === els.settings) closeSettings();
  });
  els.modalClose.addEventListener('click', () => {
    els.modal.hidden = true;
  });
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) els.modal.hidden = true;
  });

  function releaseAllMedia() {
    if (pageUnloading) return;
    pageUnloading = true;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    recorder = null;
    recordBusy = false;
    releaseScreen();
    releaseWebcam();
    releaseMic();
    endingLive = true;
    sessionLiveIntent = false;
    const publisher = whipPublisher;
    whipPublisher = null;
    if (publisher) {
      try {
        publisher.pc.close();
      } catch {
        /* already closed */
      }
      if (publisher.resourceUrl) {
        void fetch(publisher.resourceUrl, {
          method: 'DELETE',
          headers: authHeaders(),
          keepalive: true,
        }).catch(() => undefined);
      }
    }
    if (canvasCapture) {
      canvasCapture.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      });
      canvasCapture = null;
    }
    if (audio.ctx && audio.ctx.state !== 'closed') {
      void audio.ctx.close().catch(() => undefined);
      audio.ctx = null;
    }
  }

  window.addEventListener('pagehide', releaseAllMedia);
  window.addEventListener('beforeunload', releaseAllMedia);
  window.addEventListener('pageshow', () => {
    pageUnloading = false;
    updateButtons();
  });

  window.addEventListener('resize', resizeCanvas);
  loadScenes();
  loadSetup();
  loadInfo();
  loadGains();
  syncDestinationInputs();
  renderSceneList();
  showOfflineStats();
  setMeter(els.desktopMeter, 0);
  setMeter(els.micMeter, 0);
  drawFrame();
  void probeRelay();
  updateButtons();
  log('Maka web studio — capture, set destinations, then go live.');
})();
