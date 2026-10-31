(function () {
  const EXE_RELAY = 'http://127.0.0.1:38473';

  function stagingRelayBase() {
    const host = window.location.hostname;
    if (host === 'makalive.stream' || host === 'www.makalive.stream' || host === 'tabcast.live.skydav.work') {
      return `${window.location.origin}/relay`;
    }
    return EXE_RELAY;
  }

  function allowedRelayBase(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    let url;
    try { url = new URL(value); } catch { return null; }
    const host = url.hostname;
    const path = url.pathname.replace(/\/$/, '');
    if ((host === '127.0.0.1' || host === 'localhost') && url.port === '38473' && path === '') {
      return `${url.protocol}//${url.host}`;
    }
    const sameSite = host === window.location.hostname || host === 'makalive.stream' || host === 'www.makalive.stream';
    if (sameSite && path === '/relay' && (url.protocol === 'https:' || url.protocol === 'http:')) return `${url.origin}/relay`;
    return null;
  }

  let relayBase = stagingRelayBase();
  let relayIsMock = false;
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

  const RESOLUTIONS = {
    '1280x720': { width: 1280, height: 720 },
    '1920x1080': { width: 1920, height: 1080 },
    '2560x1440': { width: 2560, height: 1440 },
    '3840x2160': { width: 3840, height: 2160 },
  };
  const AUDIO_BITRATES = [96, 128, 160, 192, 320];

  function profileForSize(height, fps) {
    const fps60 = Number(fps) >= 60;
    if (height >= 2160) return '4k60';
    if (height >= 1440) return '2k60';
    if (height >= 1080) return fps60 ? '1080p60' : '1080p30';
    return fps60 ? '720p60' : '720p30';
  }

  function resolutionKeyFor(width, height) {
    const key = `${width}x${height}`;
    return Object.prototype.hasOwnProperty.call(RESOLUTIONS, key) ? key : '1280x720';
  }

  function currentEncode() {
    const key = els.cfgResolution && RESOLUTIONS[els.cfgResolution.value] ? els.cfgResolution.value : '1280x720';
    const size = RESOLUTIONS[key];
    const fps = els.cfgFps && Number(els.cfgFps.value) === 60 ? 60 : 30;
    const profile = profileForSize(size.height, fps);
    let video = Number(els.cfgVideoBitrate && els.cfgVideoBitrate.value);
    if (!Number.isFinite(video)) video = profileSpec(profile).bitrateMbps;
    video = Math.min(50, Math.max(0.5, Math.round(video * 2) / 2));
    let audioKbps = Number(els.cfgAudioBitrate && els.cfgAudioBitrate.value);
    if (!AUDIO_BITRATES.includes(audioKbps)) audioKbps = 128;
    return { width: size.width, height: size.height, fps, bitrateMbps: video, audioBitrateKbps: audioKbps, profile };
  }

  function isMockHealth(health) {
    return /mock/i.test(String(health && health.version ? health.version : '')) || (health && health.implementation === 'mock');
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
    cfgResolution: document.getElementById('cfg-resolution'),
    cfgFps: document.getElementById('cfg-fps'),
    cfgVideoBitrate: document.getElementById('cfg-video-bitrate'),
    cfgAudioBitrate: document.getElementById('cfg-audio-bitrate'),
    cfgRelayUrl: document.getElementById('cfg-relay-url'),
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
    desktopStatus: document.getElementById('desktop-audio-status'),
    desktopPanelStatus: document.getElementById('desktop-audio-panel-status'),
    micStatus: document.getElementById('mic-audio-status'),
    micDeviceNote: document.getElementById('mic-device-note'),
    micDevice: document.getElementById('mic-device'),
    desktopMute: document.getElementById('desktop-mute'),
    desktopMonitor: document.getElementById('desktop-monitor'),
    micMute: document.getElementById('mic-mute'),
    micMonitor: document.getElementById('mic-monitor'),
    btnDesktopSettings: document.getElementById('btn-desktop-audio-settings'),
    btnMicSettings: document.getElementById('btn-mic-audio-settings'),
    desktopPanel: document.getElementById('desktop-audio-panel'),
    micPanel: document.getElementById('mic-audio-panel'),
    btnMicPermission: document.getElementById('btn-mic-permission'),
    outputModeSelect: document.getElementById('program-output-mode'),
    programMode: document.getElementById('program-mode'),
    windowTitle: document.getElementById('studio-window-title'),
    browserBar: document.getElementById('program-browser-bar'),
    browserForm: document.getElementById('browser-form'),
    browserUrl: document.getElementById('browser-url'),
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

  const STORAGE = {
    scenes: 'maka.studio.scenes',
    info: 'maka.studio.info',
    setup: 'maka.studio.setup',
    gains: 'maka.studio.gains',
    mixer: 'maka.studio.mixer',
    mode: 'maka.studio.mode',
  };

  const mix = {
    desktop: { muted: false, monitor: false },
    mic: { muted: false, monitor: false, deviceId: '' },
  };
  let outputMode = 'studio';
  let bitrateTouched = false;

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
    if (!scenes.some((s) => s.id === sceneId)) return;
    activeSceneId = sceneId;
    saveScenes();
    renderSceneList();
    log(`Active scene: ${activeSceneName()}.`);
    if (relayHealth) {
      await postSceneLayout();
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

  function sessionPhase() {
    if (!whipPublisher || !whipPublisher.pc) return 'off';
    const state = whipPublisher.pc.connectionState;
    if (state === 'connected') return 'live';
    if (state === 'failed' || state === 'closed' || state === 'disconnected') return 'down';
    return 'connecting';
  }

  function setLiveUi(phase) {
    if (phase === true) phase = 'live';
    if (phase === false) phase = 'off';
    const live = phase === 'live';
    const busy = phase === 'live' || phase === 'connecting' || phase === 'down';
    const label = busy ? 'End Live' : 'Go Live';
    if (els.btnGoLiveLabel) els.btnGoLiveLabel.textContent = label;
    if (els.btnStart) els.btnStart.classList.toggle('is-live', live);
    if (els.btnGoLiveTop) els.btnGoLiveTop.textContent = label;
    if (els.streamLivePill) {
      els.streamLivePill.dataset.live = live ? 'true' : 'false';
      els.streamLivePill.textContent = live ? 'Live' : phase === 'connecting' ? 'Connecting' : 'Offline';
    }
    if (live) {
      if (!durationTimer) startDurationTimer();
      startLiveStats();
    } else {
      stopDurationTimer();
      if (phase === 'off') {
        stopLiveStats();
        showOfflineStats();
      }
    }
  }

  function selectedProfileSpec() {
    return currentEncode();
  }

  function showOfflineStats() {
    const spec = selectedProfileSpec();
    if (els.statDropped) els.statDropped.textContent = 'Dropped Frames: 0 (0.0%)';
    if (els.statFps) els.statFps.textContent = 'FPS: 0';
    if (els.statLatency) els.statLatency.textContent = '0 ms';
    if (els.statResolution) els.statResolution.textContent = `${spec.width}×${spec.height}`;
  }

  function captureResolution() {
    const track = (screenStream || webcamStream)?.getVideoTracks?.()[0];
    if (!track || track.readyState !== 'live') return null;
    const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    const width = Number(settings.width);
    const height = Number(settings.height);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  function applyResolutionText(width, height) {
    if (!els.statResolution) return;
    if (width > 0 && height > 0) {
      els.statResolution.textContent = `${Math.round(width)}×${Math.round(height)}`;
      return;
    }
    const spec = selectedProfileSpec();
    els.statResolution.textContent = `${spec.width}×${spec.height}`;
  }

  async function readLiveStats() {
    if (!whipPublisher?.pc) {
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
      const report = await whipPublisher.pc.getStats();
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
    if (sourceSize) {
      width = sourceSize.width;
      height = sourceSize.height;
    }
    applyResolutionText(width, height);
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
    if (els.statLatency) els.statLatency.textContent = typeof rttMs === 'number' ? `${rttMs} ms` : '0 ms';
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
      if (state === 'live') els.studioStatusText.textContent = relayIsMock ? 'Live on mock relay' : 'Live on MAKA.relay';
      else if (!relayHealth) els.studioStatusText.textContent = 'Relay not detected';
      else if (relayIsMock) els.studioStatusText.textContent = `Mock relay v${relayHealth.version}`;
      else els.studioStatusText.textContent = `MAKA.relay v${relayHealth.version}`;
    }
  }

  function authHeaders() {
    if (!relayHealth?.relayToken) return {};
    return { Authorization: `Bearer ${relayHealth.relayToken}` };
  }

  async function relayFetch(path, init) {
    return fetch(`${relayBase}${path}`, {
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

  async function fetchHealth(base, timeoutMs) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${PATHS.health}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body || body.ok !== true || !body.relayToken) throw new Error('health ok=false');
      return body;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function describeRelay(health) {
    const version = health.version ?? '?';
    relayIsMock = isMockHealth(health);
    if (relayIsMock) {
      setRelayStatus('warn', `Mock relay v${version}`);
      els.relayVersionLine.textContent =
        `Health OK at ${relayBase}/health — ${JSON.stringify({ ok: true, version })}. ` +
        `This is the dev mock, not MAKA.relay. Nothing real answered at ${EXE_RELAY}. ` +
        `WHIP still posts to ${relayBase}/whip. Twitch and YouTube RTMP are not encoded by this process.`;
      log(`Relay health ${version} at ${relayBase} (mock — not reported as connected).`);
      return;
    }
    setRelayStatus('ok', `MAKA.relay v${version}`);
    els.relayVersionLine.textContent = `Connected — MAKA.relay v${version} · WHIP ${relayBase}/whip`;
    log(`Relay health OK (v${version}) at ${relayBase}.`);
  }

  async function chooseRelay() {
    const params = new URLSearchParams(window.location.search);
    const relayParam = params.get('relay');
    if (relayParam) return relayParam.replace(/\/$/, '');
    const saved = allowedRelayBase(els.cfgRelayUrl && els.cfgRelayUrl.value);
    if (saved) return saved;
    if (saved === null && els.cfgRelayUrl && String(els.cfgRelayUrl.value).trim()) {
      log('Relay URL must be this site’s /relay or http://127.0.0.1:38473. Using auto-detect.');
    }
    const staging = stagingRelayBase();
    const localHealth = await fetchHealth(EXE_RELAY, 1200).catch(() => null);
    if (localHealth && !isMockHealth(localHealth)) return EXE_RELAY;
    if (staging !== EXE_RELAY) {
      const stagingHealth = await fetchHealth(staging, 4000).catch(() => null);
      if (stagingHealth) return staging;
    }
    if (localHealth) return EXE_RELAY;
    return staging;
  }

  async function probeRelay() {
    const previous = relayBase;
    try {
      const chosen = await chooseRelay();
      if (whipPublisher && chosen !== previous) {
        log('Relay URL saved. The open WHIP session stays on the previous relay until End Live.');
      } else {
        relayBase = chosen;
      }
      relayHealth = await fetchHealth(relayBase, 4000);
      describeRelay(relayHealth);
      setStreamError(null);
      updateStatsLine();
      await refreshRelayStatus();
      startStatusPoll();
      return true;
    } catch (err) {
      relayHealth = null;
      relayIsMock = false;
      stopStatusPoll();
      renderStatusJson(null);
      setRelayStatus('warn', 'Relay not detected');
      if (els.relayVersionLine) {
        els.relayVersionLine.textContent = `No relay at ${relayBase}/health. A failed health check is not a connection.`;
      }
      updateStatsLine();
      const detail = err instanceof Error ? err.message : String(err);
      logError(`No relay at ${relayBase} (${detail}).`);
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
        setRelayStatus('live', relayIsMock ? 'Live on mock relay' : 'Live on MAKA.relay');
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

  function streamTitleValue() {
    return els.streamTitle && 'value' in els.streamTitle ? String(els.streamTitle.value || '').trim() : '';
  }

  function streamCategoryValue() {
    return els.streamCategory && 'value' in els.streamCategory ? String(els.streamCategory.value || '').trim() : '';
  }

  function redactConfig(body) {
    const safe = { ...body };
    for (const key of ['twitchKey', 'youtubeKey', 'customRtmpKey']) {
      if (safe[key]) safe[key] = `set (${String(safe[key]).length} chars)`;
      else delete safe[key];
    }
    return safe;
  }

  function buildConfigBody() {
    const spec = currentEncode();
    const body = {
      profile: spec.profile,
      bitrateMbps: spec.bitrateMbps,
      audioBitrateKbps: spec.audioBitrateKbps,
      width: spec.width,
      height: spec.height,
      fps: spec.fps,
      title: streamTitleValue(),
      category: streamCategoryValue(),
    };
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
    log(`POST /config ${JSON.stringify(redactConfig(buildConfigBody()))}`);
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
    const spec = currentEncode();
    const w = spec.width;
    const h = spec.height;
    const sceneName = activeSceneName();
    const layout = {
      name: sceneName,
      title: streamTitleValue(),
      category: streamCategoryValue(),
      mode: outputMode,
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
    if (outputMode === 'browse') {
      const browserW = Math.round(w * 0.35);
      const browserH = Math.round(browserW * (9 / 16));
      layout.sources.push({ id: 'browser', type: 'video', label: 'Browser', x: 24, y: 24, width: browserW, height: browserH, zIndex: 1 });
    }
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
        if (res.ok) {
          log(`POST /scene (${w}×${h}) mode=${outputMode} title=${JSON.stringify(streamTitleValue())} category=${JSON.stringify(streamCategoryValue())} scene=${activeSceneName()}.`);
        }
      })
      .catch(() => undefined);
  }

  function resizeCanvas() {
    const spec = currentEncode();
    if (els.canvas.width !== spec.width || els.canvas.height !== spec.height) {
      els.canvas.width = spec.width;
      els.canvas.height = spec.height;
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
    resizeCanvas();
    const w = els.canvas.width;
    const h = els.canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const main = screenStream || webcamStream;
    const mainTrack = main && main.getVideoTracks()[0];
    const hasVideo = Boolean(mainTrack && mainTrack.readyState === 'live');
    const livePreview = hasVideo || Boolean(overlayImage);
    if (els.programScreen) els.programScreen.classList.toggle('is-live-preview', livePreview);
    if (els.empty) els.empty.hidden = livePreview;
    if (hasVideo) drawVideo(main, 0, 0, w, h, 'contain');
    if (screenStream && webcamStream && webcamStream.getVideoTracks()[0]?.readyState === 'live') {
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
  function linkMonitor(gain, on) {
    if (!audio.ctx || !gain) return;
    try { gain.disconnect(audio.ctx.destination); } catch { /* not monitoring */ }
    if (on) gain.connect(audio.ctx.destination);
  }

  function applyChannelTracks() {
    for (const track of screenStream ? screenStream.getAudioTracks() : []) track.enabled = !mix.desktop.muted;
    for (const track of micStream ? micStream.getAudioTracks() : []) track.enabled = !mix.mic.muted;
  }

  function refreshDesktopStatus() {
    const tracks = screenStream ? screenStream.getAudioTracks().filter((t) => t.readyState === 'live') : [];
    let text = 'No desktop audio detected';
    if (tracks.length) {
      const label = tracks[0].label ? ` · ${tracks[0].label}` : '';
      text = mix.desktop.muted ? `Muted${label}` : `Desktop audio detected${label}`;
    } else if (mix.desktop.muted) text = 'No desktop audio detected · muted';
    if (els.desktopStatus) els.desktopStatus.textContent = text;
    if (els.desktopPanelStatus) els.desktopPanelStatus.textContent = text;
  }

  function refreshMicStatus() {
    const track = micStream && micStream.getAudioTracks().find((t) => t.readyState === 'live');
    const text = !track ? 'Off' : mix.mic.muted ? 'Muted' : (track.label || 'Live');
    if (els.micStatus) els.micStatus.textContent = text;
  }

  function applyGains() {
    if (audio.desktopGain) audio.desktopGain.gain.value = mix.desktop.muted ? 0 : gainFromFader(els.faderDesktop);
    if (audio.micGain) audio.micGain.gain.value = mix.mic.muted ? 0 : gainFromFader(els.faderMic);
    applyChannelTracks();
    linkMonitor(audio.desktopGain, mix.desktop.monitor && !mix.desktop.muted);
    linkMonitor(audio.micGain, mix.mic.monitor && !mix.mic.muted);
    refreshDesktopStatus();
    refreshMicStatus();
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
      setMeter(els.desktopMeter, desktopLive && !mix.desktop.muted ? meterPercent(audio.desktopAnalyser) : 0);
      setMeter(els.micMeter, micLive && !mix.mic.muted ? meterPercent(audio.micAnalyser) : 0);
      refreshDesktopStatus();
    }, 100);
  }

  function attachDisplayAudio(stream) {
    disconnectAudioNode(audio.desktopSource);
    audio.desktopSource = null;
    const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
    refreshDesktopStatus();
    if (!tracks.length) {
      log('No desktop audio detected.');
      return;
    }
    const ctx = ensureAudioGraph();
    audio.desktopSource = ctx.createMediaStreamSource(new MediaStream(tracks));
    audio.desktopSource.connect(audio.desktopGain);
    applyGains();
  }

  function detachDisplayAudio() {
    disconnectAudioNode(audio.desktopSource);
    audio.desktopSource = null;
    setMeter(els.desktopMeter, 0);
    refreshDesktopStatus();
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
    refreshMicStatus();
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

  function resetCanvasCapture() {
    if ((recorder && recorder.state === 'recording') || whipPublisher) return false;
    if (canvasCapture) {
      canvasCapture.getTracks().forEach((t) => t.stop());
      canvasCapture = null;
    }
    return true;
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

  async function applySenderBitrates(pc) {
    const target = pc || (whipPublisher && whipPublisher.pc);
    if (!target || typeof target.getSenders !== 'function') return;
    const enc = currentEncode();
    const videoBps = Math.round(enc.bitrateMbps * 1000000);
    const audioBps = enc.audioBitrateKbps * 1000;
    for (const sender of target.getSenders()) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = sender.track.kind === 'audio' ? audioBps : videoBps;
      try { await sender.setParameters(params); } catch { /* not negotiated yet */ }
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
    const response = await fetch(`${relayBase}${PATHS.whip}`, {
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
    const resourceUrl = location ? new URL(location, `${relayBase}${PATHS.whip}`).href : null;
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    void applySenderBitrates(pc);
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
    const canvasStream = programCanvasStream();
    const gameplay = namedStream(TRACK_IDS.gameplay, canvasStream.getVideoTracks());
    let webcam = null;
    if (screenStream && webcamStream) {
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

  function hasCapture() {
    return Boolean(
      (screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live')) ||
        (webcamStream && webcamStream.getVideoTracks().some((t) => t.readyState === 'live')) ||
        overlayImage,
    );
  }

  function updateButtons() {
    const live = Boolean(whipPublisher);
    if (els.btnStop) els.btnStop.disabled = !live;
    if (els.btnScreen) {
      els.btnScreen.classList.toggle(
        'is-on',
        Boolean(screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live')),
      );
    }
    if (els.btnWebcam) {
      els.btnWebcam.classList.toggle(
        'is-on',
        Boolean(webcamStream && webcamStream.getVideoTracks().some((t) => t.readyState === 'live')),
      );
    }
    if (els.btnMic) {
      els.btnMic.classList.toggle(
        'is-on',
        Boolean(micStream && micStream.getAudioTracks().some((t) => t.readyState === 'live')),
      );
    }
    if (els.btnOverlay) {
      els.btnOverlay.classList.toggle('is-on', Boolean(overlayImage));
    }
    setLiveUi(sessionPhase());
  }

  async function onStart() {
    if (!hasCapture()) {
      log('Add a game capture, webcam, or overlay image first.');
      if (els.studioStatusText) els.studioStatusText.textContent = 'Add a source before going live';
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
      log(`Publishing WHIP to ${relayBase}${PATHS.whip}…`);
      sessionLiveIntent = true;
      const publisher = await publishWhip(buildPublishSources());
      whipPublisher = publisher;
      publisher.pc.onconnectionstatechange = () => {
        if (whipPublisher !== publisher) return;
        log(`WHIP connection: ${publisher.pc.connectionState}`);
        if (publisher.pc.connectionState === 'connected') {
          setRelayStatus('live', relayIsMock ? 'Live on mock relay' : 'Live on MAKA.relay');
          void refreshRelayStatus();
        }
        updateButtons();
      };
      log('WHIP active — check relay /status for pipeline state.');
      updateButtons();
      await refreshRelayStatus();
    } catch (err) {
      sessionLiveIntent = false;
      whipPublisher = null;
      logError(`Go live failed: ${err instanceof Error ? err.message : err}`);
      if (!relayHealth && els.modal) els.modal.hidden = false;
      else openSettings();
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
    if (relayHealth) describeRelay(relayHealth);
    await refreshRelayStatus();
    updateButtons();
    log('Stream stopped.');
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
    refreshMicStatus();
  }

  async function startMicrophone(deviceId) {
    releaseMic();
    const audioConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    } catch (err) {
      if (!deviceId) throw err;
      log('That microphone could not be opened. Trying the default input.');
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    const track = micStream.getAudioTracks()[0];
    if (track) {
      track.onended = () => { releaseMic(); updateButtons(); };
      const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
      if (settings.deviceId) mix.mic.deviceId = settings.deviceId;
    }
    attachMicAudio(micStream);
    applyGains();
    saveMixer();
    log(track && track.label ? `Microphone started: ${track.label}.` : 'Microphone started.');
  }

  function clearOverlay() {
    overlayImage = null;
    if (overlayUrl) {
      URL.revokeObjectURL(overlayUrl);
      overlayUrl = '';
    }
  }

  async function captureDisplay() {
    const video = outputMode === 'browse' ? { displaySurface: 'browser' } : true;
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video, audio: true });
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'AbortError') throw err;
      return navigator.mediaDevices.getDisplayMedia({ video: true });
    }
  }

  els.btnWebcam?.addEventListener('click', async () => {
    if (webcamStream && webcamStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      releaseWebcam();
      log('Webcam stopped.');
      updateButtons();
      return;
    }
    releaseWebcam();
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = webcamStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          releaseWebcam();
          updateButtons();
        };
      }
      log('Webcam added.');
    } catch (err) {
      const name = err && err.name;
      log(name === 'NotAllowedError' || name === 'AbortError' ? 'Webcam cancelled.' : `Webcam failed: ${err instanceof Error ? err.message : err}`);
    }
    updateButtons();
  });

  els.btnScreen?.addEventListener('click', async () => {
    if (screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      releaseScreen();
      log('Game capture stopped.');
      updateButtons();
      return;
    }
    releaseScreen();
    try {
      screenStream = await captureDisplay();
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          releaseScreen();
          log('Game capture ended.');
          updateButtons();
        };
      }
      attachDisplayAudio(screenStream);
      const audioCount = screenStream.getAudioTracks().filter((t) => t.readyState === 'live').length;
      log(audioCount ? `Game capture started (${audioCount} audio track${audioCount === 1 ? '' : 's'}).` : 'Game capture started (no audio shared).');
    } catch (err) {
      releaseScreen();
      const name = err && err.name;
      log(
        name === 'NotAllowedError' || name === 'AbortError'
          ? 'Game capture cancelled.'
          : `Game capture failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    updateButtons();
  });

  els.btnMic?.addEventListener('click', async () => {
    if (micStream && micStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      releaseMic();
      log('Microphone stopped.');
      updateButtons();
      return;
    }
    try {
      await startMicrophone(mix.mic.deviceId);
    } catch (err) {
      releaseMic();
      const name = err && err.name;
      log(
        name === 'NotAllowedError' || name === 'AbortError'
          ? 'Microphone cancelled.'
          : `Microphone failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    updateButtons();
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
      recorder.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      log('Recording is not available in this browser.');
      return;
    }
    let stream;
    try {
      stream = recordingStream();
    } catch (err) {
      log(`Recording failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    if (!stream.getVideoTracks().length) {
      log('Program canvas is not ready to record.');
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
      const enc = currentEncode();
      const recOpts = {
        videoBitsPerSecond: Math.round(enc.bitrateMbps * 1000000),
        audioBitsPerSecond: enc.audioBitrateKbps * 1000,
      };
      if (mimeType) recOpts.mimeType = mimeType;
      recorder = new MediaRecorder(stream, recOpts);
    } catch (err) {
      recorder = null;
      log(`Recording failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) recordedChunks.push(event.data);
    };
    recorder.onstop = () => {
      const type = (recorder && recorder.mimeType) || 'video/webm';
      const blob = new Blob(recordedChunks, { type });
      recordedChunks = [];
      setRecordingUi(false);
      if (!blob.size) {
        log('Recording was empty.');
        return;
      }
      downloadRecording(blob);
      log('Recording saved as WebM.');
    };
    recorder.onerror = () => {
      setRecordingUi(false);
      log('Recording failed.');
    };
    try {
      recorder.start(1000);
    } catch (err) {
      setRecordingUi(false);
      log(`Recording failed: ${err instanceof Error ? err.message : err}`);
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
    const enc = currentEncode();
    writeStorage(STORAGE.setup, {
      resolution: els.cfgResolution ? els.cfgResolution.value : '1280x720',
      fps: enc.fps,
      videoBitrate: enc.bitrateMbps,
      audioBitrate: enc.audioBitrateKbps,
      bitrateTouched,
      relayUrl: els.cfgRelayUrl ? els.cfgRelayUrl.value : '',
      profile: enc.profile,
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
    if (data.resolution && RESOLUTIONS[data.resolution] && els.cfgResolution) els.cfgResolution.value = data.resolution;
    else if (data.profile && ENCODE_PROFILES[data.profile] && els.cfgResolution) {
      const spec = ENCODE_PROFILES[data.profile];
      els.cfgResolution.value = resolutionKeyFor(spec.width, spec.height);
      if (els.cfgFps) els.cfgFps.value = String(spec.fps >= 60 ? 60 : 30);
      if (typeof data.videoBitrate !== 'number' && els.cfgVideoBitrate) els.cfgVideoBitrate.value = String(spec.bitrateMbps);
    }
    if ((data.fps === 30 || data.fps === 60) && els.cfgFps) els.cfgFps.value = String(data.fps);
    if (typeof data.videoBitrate === 'number' && els.cfgVideoBitrate) {
      bitrateTouched = data.bitrateTouched !== false;
      els.cfgVideoBitrate.value = String(data.videoBitrate);
    }
    if (AUDIO_BITRATES.includes(Number(data.audioBitrate)) && els.cfgAudioBitrate) {
      els.cfgAudioBitrate.value = String(Number(data.audioBitrate));
    }
    if (typeof data.relayUrl === 'string' && els.cfgRelayUrl) els.cfgRelayUrl.value = data.relayUrl;
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

  function onEncodeChange(fromBitrate) {
    if (fromBitrate) bitrateTouched = true;
    else if (!bitrateTouched && els.cfgVideoBitrate && els.cfgResolution && els.cfgFps) {
      const size = RESOLUTIONS[els.cfgResolution.value] || RESOLUTIONS['1280x720'];
      const fps = Number(els.cfgFps.value) === 60 ? 60 : 30;
      els.cfgVideoBitrate.value = String(profileSpec(profileForSize(size.height, fps)).bitrateMbps);
    }
    saveSetup();
    if (!whipPublisher) showOfflineStats();
    if (!resetCanvasCapture()) log('FPS applies when the next Go Live or recording creates the canvas stream.');
    void applySenderBitrates();
    if (relayHealth && !whipPublisher) {
      void postRelayConfig().then(() => postSceneLayout()).catch((err) => log(err instanceof Error ? err.message : String(err)));
    }
  }
  els.cfgResolution?.addEventListener('change', () => onEncodeChange(false));
  els.cfgFps?.addEventListener('change', () => onEncodeChange(false));
  els.cfgVideoBitrate?.addEventListener('change', () => onEncodeChange(true));
  els.cfgAudioBitrate?.addEventListener('change', () => onEncodeChange(false));
  els.cfgRelayUrl?.addEventListener('change', () => { saveSetup(); void probeRelay(); });
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
    if (!file.type.startsWith('image/')) {
      log('Overlay needs an image file.');
      return;
    }
    clearOverlay();
    overlayUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      overlayImage = img;
      log('Overlay image drawn on the program.');
      updateButtons();
    };
    img.onerror = () => {
      clearOverlay();
      log('Could not read that overlay image.');
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

  function saveMixer() {
    writeStorage(STORAGE.mixer, {
      desktopMuted: mix.desktop.muted,
      desktopMonitor: mix.desktop.monitor,
      micMuted: mix.mic.muted,
      micMonitor: mix.mic.monitor,
      micDeviceId: mix.mic.deviceId,
    });
  }

  function loadMixer() {
    const data = readStorage(STORAGE.mixer);
    if (!data || typeof data !== 'object') return;
    mix.desktop.muted = Boolean(data.desktopMuted);
    mix.desktop.monitor = Boolean(data.desktopMonitor);
    mix.mic.muted = Boolean(data.micMuted);
    mix.mic.monitor = Boolean(data.micMonitor);
    mix.mic.deviceId = typeof data.micDeviceId === 'string' ? data.micDeviceId : '';
    if (els.desktopMute) els.desktopMute.checked = mix.desktop.muted;
    if (els.desktopMonitor) els.desktopMonitor.checked = mix.desktop.monitor;
    if (els.micMute) els.micMute.checked = mix.mic.muted;
    if (els.micMonitor) els.micMonitor.checked = mix.mic.monitor;
  }

  function closeChannelPanels() {
    for (const [panel, button] of [[els.desktopPanel, els.btnDesktopSettings], [els.micPanel, els.btnMicSettings]]) {
      if (panel) panel.hidden = true;
      if (button) button.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleChannelPanel(panel, button) {
    const willOpen = Boolean(panel && panel.hidden);
    closeChannelPanels();
    if (!panel || !button) return;
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen && panel === els.micPanel) void refreshMicDevices();
  }

  async function refreshMicDevices() {
    if (!els.micDevice || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      if (els.micDeviceNote) els.micDeviceNote.textContent = 'This browser cannot list microphones.';
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput');
    const named = mics.some((d) => d.label);
    els.micDevice.replaceChildren();
    if (els.btnMicPermission) els.btnMicPermission.hidden = named || !mics.length;
    if (!mics.length) {
      if (els.micDeviceNote) els.micDeviceNote.textContent = 'No microphone detected.';
      return;
    }
    if (!named) {
      if (els.micDeviceNote) els.micDeviceNote.textContent = 'Microphone permission is needed to list input devices.';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Allow microphone to see device names';
      els.micDevice.appendChild(opt);
      return;
    }
    if (els.micDeviceNote) {
      els.micDeviceNote.textContent = micStream
        ? 'Live microphone. The meter follows this input.'
        : 'Microphone is off. The meter stays silent until it is on.';
    }
    for (const mic of mics) {
      const opt = document.createElement('option');
      opt.value = mic.deviceId;
      opt.textContent = mic.label || 'Microphone';
      els.micDevice.appendChild(opt);
    }
    if (mix.mic.deviceId && [...els.micDevice.options].some((o) => o.value === mix.mic.deviceId)) {
      els.micDevice.value = mix.mic.deviceId;
    }
  }

  function applyOutputMode(mode, options) {
    outputMode = mode === 'browse' ? 'browse' : 'studio';
    if (els.outputModeSelect && els.outputModeSelect.value !== outputMode) els.outputModeSelect.value = outputMode;
    document.body.dataset.mode = outputMode;
    const browse = outputMode === 'browse';
    if (els.browserBar) els.browserBar.hidden = !browse;
    if (els.programMode) els.programMode.textContent = browse ? '• Browser' : '• Live Output';
    if (els.windowTitle) els.windowTitle.textContent = browse ? 'Search' : 'Maka Studio';
    document.title = browse ? 'Maka — Search' : 'Maka Studio';
    if (els.empty) {
      els.empty.textContent = browse
        ? 'Browser Mode. Open a page, then share that tab with Game Capture.'
        : 'Select a display or window to start streaming';
    }
    if (!options || !options.silent) {
      writeStorage(STORAGE.mode, { mode: outputMode, url: els.browserUrl ? els.browserUrl.value : '' });
      log(browse ? 'Browser Mode — Search. Share a browser tab to put it on the program.' : 'Studio Mode — the program is the live output.');
    }
    if (relayHealth && !(options && options.skipScene)) void postSceneLayout();
  }

  function loadOutputMode() {
    const data = readStorage(STORAGE.mode);
    if (data && typeof data.url === 'string' && els.browserUrl) els.browserUrl.value = data.url;
    applyOutputMode(data && data.mode === 'browse' ? 'browse' : 'studio', { silent: true, skipScene: true });
  }

  window.addEventListener('resize', resizeCanvas);
  loadScenes();
  loadSetup();
  loadInfo();
  loadGains();
  loadMixer();
  loadOutputMode();
  syncDestinationInputs();
  renderSceneList();
  showOfflineStats();
  setMeter(els.desktopMeter, 0);
  setMeter(els.micMeter, 0);
  refreshDesktopStatus();
  refreshMicStatus();
  els.btnDesktopSettings?.addEventListener('click', (event) => { event.stopPropagation(); toggleChannelPanel(els.desktopPanel, els.btnDesktopSettings); });
  els.btnMicSettings?.addEventListener('click', (event) => { event.stopPropagation(); toggleChannelPanel(els.micPanel, els.btnMicSettings); });
  document.addEventListener('click', (event) => {
    const t = event.target;
    if (t && t.closest && (t.closest('#desktop-audio-panel') || t.closest('#mic-audio-panel') || t.closest('.audio-channel-settings'))) return;
    closeChannelPanels();
  });
  function bindMute(input, channel) {
    input?.addEventListener('change', () => {
      mix[channel].muted = Boolean(input.checked);
      saveMixer();
      if (audio.ctx) applyGains();
      else { refreshDesktopStatus(); refreshMicStatus(); }
    });
  }
  bindMute(els.desktopMute, 'desktop');
  bindMute(els.micMute, 'mic');
  els.desktopMonitor?.addEventListener('change', () => { mix.desktop.monitor = Boolean(els.desktopMonitor.checked); saveMixer(); if (!audio.ctx && mix.desktop.monitor) ensureAudioGraph(); else applyGains(); });
  els.micMonitor?.addEventListener('change', () => { mix.mic.monitor = Boolean(els.micMonitor.checked); saveMixer(); if (!audio.ctx && mix.mic.monitor) ensureAudioGraph(); else applyGains(); });
  els.micDevice?.addEventListener('change', () => {
    mix.mic.deviceId = els.micDevice.value;
    saveMixer();
    if (micStream) void startMicrophone(mix.mic.deviceId).then(() => updateButtons()).catch((err) => log(`Microphone failed: ${err instanceof Error ? err.message : err}`));
    else log('Microphone selection saved. The meter stays silent until the mic is on.');
  });
  els.btnMicPermission?.addEventListener('click', async () => {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      tmp.getTracks().forEach((t) => t.stop());
      await refreshMicDevices();
    } catch (err) {
      if (els.micDeviceNote) els.micDeviceNote.textContent = 'Microphone permission is needed to list input devices.';
      log(err && err.name === 'NotAllowedError' ? 'Microphone permission was blocked.' : `Microphone permission failed: ${err instanceof Error ? err.message : err}`);
    }
  });
  els.outputModeSelect?.addEventListener('change', () => applyOutputMode(els.outputModeSelect.value));
  els.browserForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = els.browserUrl ? els.browserUrl.value.trim() : '';
    if (!raw) return;
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    writeStorage(STORAGE.mode, { mode: outputMode, url });
    window.open(url, '_blank', 'noopener');
    log(`Opened ${url} in a new tab. Share that tab with Game Capture to put it on the program.`);
  });
  drawFrame();
  void probeRelay();
  updateButtons();
  log('Maka web studio — capture, set destinations, then go live.');
})();
