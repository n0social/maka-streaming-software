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
    sceneImageFile: document.getElementById('scene-image-file'),
    overlayMenu: document.getElementById('btn-overlay-menu'),
    popover: document.getElementById('studio-popover'),
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

  const MAX_CUSTOM_SCENES = 3;
  const CUSTOM_SCENE_ID_RE = /^custom-[1-3]$/;
  const LEGACY_SCENE_IDS = {
    'scene-gameplay': 'gaming-cam',
    'scene-starting': 'starting-soon',
    'scene-chatting': 'desk-only',
    'scene-intermission': 'intermission',
    'scene-ending': 'ending',
  };
  const DEFAULT_SCENES = [
    { id: 'gaming-cam', name: 'Gameplay', iconKind: 'gameplay' },
    { id: 'starting-soon', name: 'Starting Soon', iconKind: 'starting' },
    { id: 'desk-only', name: 'Just Chatting', iconKind: 'chatting' },
    { id: 'intermission', name: 'Intermission', iconKind: 'intermission' },
    { id: 'ending', name: 'Ending Scene', iconKind: 'ending' },
  ];
  const SCENE_STUBS = {
    'starting-soon': {
      title: 'Starting Soon',
      subtitle: 'Hang tight — we’ll be live in a moment',
    },
    intermission: { title: 'Intermission', subtitle: 'Short break — back shortly' },
    ending: { title: 'Ending Scene', subtitle: 'Thanks for watching' },
  };

  /** @type {{ id: string, name: string, iconKind: string }[]} */
  let scenes = DEFAULT_SCENES.map((s) => ({ ...s }));
  let activeSceneId = 'gaming-cam';
  /** @type {Record<string, string>} */
  let sceneImages = {};
  const sceneImageElements = new Map();
  let imageTargetSceneId = '';
  let layers = { game: true, cam: true };
  let overlayPresetId = '';
  let overlayOn = false;
  let liveStartedAt = 0;
  let durationTimer = 0;
  let statsTimer = 0;
  let meterTimer = 0;
  let recorder = null;
  let recordedChunks = [];
  let canvasCapture = null;

  const STORAGE = {
    scenes: 'maka.studio.scenes',
    sceneImages: 'maka.studio.sceneImages',
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
      return true;
    } catch {
      return false;
    }
  }

  function isCustomSceneId(id) {
    return CUSTOM_SCENE_ID_RE.test(id);
  }

  function isCustomLike(id) {
    return isCustomSceneId(id) || id.startsWith('scene-custom-');
  }

  function isStubScene(id) {
    return Object.prototype.hasOwnProperty.call(SCENE_STUBS, id);
  }

  function sceneSupportsImage(id) {
    return id === 'desk-only' || isStubScene(id) || isCustomLike(id);
  }

  function sceneImageMask(id) {
    if (id === 'desk-only' || isCustomLike(id)) return 'game-mask-only';
    if (isStubScene(id)) return 'full-mask-except-chat';
    return null;
  }

  function migrateSceneId(id) {
    return LEGACY_SCENE_IDS[id] || id;
  }

  function defaultCustomName(id) {
    if (isCustomSceneId(id)) return `Custom Scene ${id.slice('custom-'.length)}`;
    return 'Custom Scene';
  }

  function coerceScene(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = migrateSceneId(typeof raw.id === 'string' ? raw.id.trim() : '');
    if (!id) return null;
    const builtin = DEFAULT_SCENES.find((s) => s.id === id);
    if (builtin) return { id: builtin.id, name: builtin.name, iconKind: builtin.iconKind };
    if (!isCustomLike(id)) return null;
    const nameRaw = typeof raw.name === 'string' ? raw.name.trim() : '';
    return {
      id,
      name: (nameRaw || defaultCustomName(id)).slice(0, 80),
      iconKind: 'custom',
    };
  }

  function customCount() {
    return scenes.filter((s) => !DEFAULT_SCENES.some((d) => d.id === s.id)).length;
  }

  function nextCustomSceneId() {
    for (let i = 1; i <= MAX_CUSTOM_SCENES; i += 1) {
      const id = `custom-${i}`;
      if (!scenes.some((s) => s.id === id)) return id;
    }
    return null;
  }

  function loadScenes() {
    const data = readStorage(STORAGE.scenes);
    if (!data || typeof data !== 'object' || !Array.isArray(data.scenes)) return;
    const next = [];
    const seen = new Set();
    for (const raw of data.scenes) {
      const scene = coerceScene(raw);
      if (!scene || seen.has(scene.id)) continue;
      seen.add(scene.id);
      next.push(scene);
    }
    if (!next.length) return;
    scenes = next;
    const wanted = typeof data.activeSceneId === 'string' ? migrateSceneId(data.activeSceneId) : '';
    activeSceneId = scenes.some((s) => s.id === wanted) ? wanted : scenes[0].id;
  }

  function loadSceneImages() {
    const data = readStorage(STORAGE.sceneImages);
    sceneImages = {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const [id, value] of Object.entries(data)) {
      const sceneId = migrateSceneId(id);
      if (!sceneSupportsImage(sceneId)) continue;
      if (typeof value !== 'string' || !value.startsWith('data:image/')) continue;
      sceneImages[sceneId] = value;
    }
  }

  function saveSceneImages() {
    const ok = writeStorage(STORAGE.sceneImages, sceneImages);
    return ok !== false;
  }

  function saveScenes() {
    writeStorage(STORAGE.scenes, { scenes, activeSceneId });
  }

  function applySceneLayers(sceneId) {
    overlayPresetId = '';
    overlayOn = false;
    if (sceneId === 'gaming-cam') {
      layers = { game: true, cam: true };
    } else if (sceneId === 'desk-only' || isCustomLike(sceneId)) {
      layers = { game: false, cam: true };
    } else if (isStubScene(sceneId)) {
      layers = { game: false, cam: false };
    } else {
      layers = { game: true, cam: true };
    }
  }

  function closePopover() {
    if (!els.popover) return;
    els.popover.hidden = true;
    els.popover.replaceChildren();
    document.querySelectorAll('.studio-row-menu[aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function openPopover(anchor, items) {
    if (!els.popover) return;
    closePopover();
    const labelNodes = [];
    for (const item of items) {
      if (item.heading) {
        const label = document.createElement('p');
        label.className = 'studio-popover-label';
        label.textContent = item.heading;
        labelNodes.push(label);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = item.label;
      if (item.checked) button.setAttribute('aria-checked', 'true');
      button.addEventListener('click', () => {
        closePopover();
        item.onSelect();
      });
      labelNodes.push(button);
    }
    if (!labelNodes.length) return;
    els.popover.replaceChildren(...labelNodes);
    els.popover.hidden = false;
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    const rect = anchor.getBoundingClientRect();
    const width = 220;
    let left = Math.min(rect.right - width, window.innerWidth - width - 8);
    if (left < 8) left = 8;
    els.popover.style.left = `${left}px`;
    els.popover.style.top = `${rect.bottom + 4}px`;
    els.popover.style.width = `${width}px`;
    window.requestAnimationFrame(() => {
      if (!els.popover || els.popover.hidden) return;
      const box = els.popover.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 8) {
        els.popover.style.top = `${Math.max(8, rect.top - box.height - 4)}px`;
      }
    });
  }

  function openSceneMenu(scene, anchor) {
    const items = [];
    if (sceneSupportsImage(scene.id)) {
      items.push({
        label: 'Choose image…',
        onSelect: () => chooseSceneImage(scene.id),
      });
      if (sceneImages[scene.id]) {
        items.push({
          label: 'Clear image',
          onSelect: () => clearSceneImage(scene.id),
        });
      }
    }
    items.push({
      label: scenes.length <= 1 ? "Can't delete the last scene" : 'Delete scene',
      onSelect: () => deleteScene(scene.id),
    });
    openPopover(anchor, items);
  }

  function renderSceneList() {
    if (!els.sceneList) return;
    els.sceneList.replaceChildren();
    for (const scene of scenes) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'studio-row';
      const custom = !DEFAULT_SCENES.some((d) => d.id === scene.id);
      const btn = document.createElement(custom ? 'div' : 'button');
      if (!custom) btn.type = 'button';
      else {
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
      }
      btn.className = 'studio-list-item' + (scene.id === activeSceneId ? ' is-on' : '');
      btn.dataset.scene = scene.id;
      const icon = document.createElement('span');
      icon.className = 'scene-icon';
      icon.innerHTML = sceneIconSvg(scene.iconKind || 'custom');
      btn.appendChild(icon);
      if (custom) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'studio-scene-name';
        input.value = scene.name;
        input.maxLength = 80;
        input.spellcheck = false;
        input.setAttribute('aria-label', 'Scene name');
        input.title = 'Rename this scene';
        input.dataset.sceneName = scene.id;
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
          }
        });
        input.addEventListener('blur', () => renameScene(scene.id, input.value));
        btn.appendChild(input);
      } else {
        const name = document.createElement('span');
        name.className = 'studio-list-text';
        name.textContent = scene.name;
        btn.appendChild(name);
      }
      btn.setAttribute('aria-current', scene.id === activeSceneId ? 'true' : 'false');
      btn.addEventListener('click', (event) => {
        if (event.target.closest('input, .studio-row-menu')) return;
        void switchScene(scene.id);
      });
      if (custom) {
        btn.addEventListener('keydown', (event) => {
          if (event.target !== btn) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          void switchScene(scene.id);
        });
      }
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'studio-row-menu';
      menu.dataset.sceneMenu = scene.id;
      menu.setAttribute('aria-haspopup', 'menu');
      menu.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-label', `Options for ${scene.name}`);
      menu.title = 'Scene options';
      menu.textContent = '•••';
      menu.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSceneMenu(scene, menu);
      });
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
    syncAddButtons();
    updateProgramLabel();
    updateButtons();
  }

  function syncAddButtons() {
    const atMax = customCount() >= MAX_CUSTOM_SCENES;
    const title = atMax ? `Maximum of ${MAX_CUSTOM_SCENES} custom scenes` : 'Add scene';
    if (els.btnAddScene) {
      els.btnAddScene.disabled = atMax;
      els.btnAddScene.title = title;
    }
    const alt = document.getElementById('btn-add-scene-alt');
    if (alt) {
      alt.disabled = atMax;
      alt.title = title;
    }
  }

  async function switchScene(sceneId) {
    if (!scenes.some((s) => s.id === sceneId)) return;
    activeSceneId = sceneId;
    applySceneLayers(sceneId);
    saveScenes();
    renderSceneList();
    log(`Active scene: ${activeSceneName()}.`);
    if (relayHealth) await postSceneLayout();
  }

  function renameScene(sceneId, rawName) {
    if (DEFAULT_SCENES.some((d) => d.id === sceneId)) return;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const name = String(rawName || '').trim().slice(0, 80) || defaultCustomName(sceneId);
    if (scene.name === name) return;
    scene.name = name;
    saveScenes();
    renderSceneList();
    log(`Renamed scene to ${name}.`);
    if (sceneId === activeSceneId && relayHealth) void postSceneLayout();
  }

  function deleteScene(sceneId) {
    if (scenes.length <= 1) {
      log("Can't delete the last scene.");
      return;
    }
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) return;
    const removed = scenes[index];
    const wasActive = activeSceneId === sceneId;
    scenes.splice(index, 1);
    if (sceneImages[sceneId]) {
      delete sceneImages[sceneId];
      sceneImageElements.delete(sceneId);
      saveSceneImages();
    }
    if (wasActive) {
      const neighbor = scenes[Math.min(index, scenes.length - 1)];
      activeSceneId = neighbor.id;
      applySceneLayers(neighbor.id);
    }
    saveScenes();
    renderSceneList();
    log(`Deleted ${removed.name}.`);
    if (wasActive && relayHealth) void postSceneLayout();
  }

  function addScene() {
    if (customCount() >= MAX_CUSTOM_SCENES) {
      log(`Maximum of ${MAX_CUSTOM_SCENES} custom scenes.`);
      return;
    }
    const id = nextCustomSceneId();
    if (!id) return;
    scenes.push({ id, name: defaultCustomName(id), iconKind: 'custom' });
    saveScenes();
    void switchScene(id).then(() => {
      const input = els.sceneList && els.sceneList.querySelector(`input[data-scene-name="${id}"]`);
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  function sceneImageElement(sceneId) {
    const url = sceneImages[sceneId];
    if (!url) return null;
    let img = sceneImageElements.get(sceneId);
    if (!img || img.dataset.url !== url) {
      img = new Image();
      img.dataset.url = url;
      img.src = url;
      sceneImageElements.set(sceneId, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  function chooseSceneImage(sceneId) {
    if (!sceneSupportsImage(sceneId) || !els.sceneImageFile) return;
    imageTargetSceneId = sceneId;
    els.sceneImageFile.click();
  }

  function clearSceneImage(sceneId) {
    if (!sceneImages[sceneId]) return;
    delete sceneImages[sceneId];
    sceneImageElements.delete(sceneId);
    saveSceneImages();
    log('Scene image cleared.');
    if (sceneId === activeSceneId && relayHealth) void postSceneLayout();
  }

  function storeSceneImageFile(sceneId, file) {
    const mimeOk = file.type === 'image/png' || file.type === 'image/jpeg';
    const nameOk = /\.(png|jpe?g)$/i.test(file.name || '');
    if (!mimeOk && !nameOk) {
      log('Scene image must be a PNG or JPG.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      log('Scene image must be under 8 MB.');
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
      canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
      const imageCtx = canvas.getContext('2d');
      if (!imageCtx) {
        log('Could not read that scene image.');
        return;
      }
      imageCtx.fillStyle = '#ffffff';
      imageCtx.fillRect(0, 0, canvas.width, canvas.height);
      imageCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let dataUrl = '';
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      } catch {
        log('Could not read that scene image.');
        return;
      }
      sceneImages[sceneId] = dataUrl;
      const stored = new Image();
      stored.dataset.url = dataUrl;
      stored.src = dataUrl;
      sceneImageElements.set(sceneId, stored);
      try {
        localStorage.setItem(STORAGE.sceneImages, JSON.stringify(sceneImages));
      } catch {
        delete sceneImages[sceneId];
        sceneImageElements.delete(sceneId);
        log('That scene image is too large to save in this browser.');
        return;
      }
      const scene = scenes.find((s) => s.id === sceneId);
      log(`Scene image set for ${scene ? scene.name : 'scene'}.`);
      if (sceneId === activeSceneId && relayHealth) void postSceneLayout();
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      log('Could not read that scene image.');
    };
    img.src = blobUrl;
  }

  function fracBox(w, h, x, y, wf, hf) {
    return {
      x: Math.round(w * x),
      y: Math.round(h * y),
      width: Math.max(1, Math.round(w * wf)),
      height: Math.max(1, Math.round(h * hf)),
    };
  }

  function camBox(w, h, x, y, wf) {
    const width = Math.max(1, Math.round(w * wf));
    const height = Math.max(1, Math.round(width * (9 / 16)));
    return { x: Math.round(w * x), y: Math.round(h * y), width, height };
  }

  function specialCam(w, h, kind) {
    if (kind === 'focus') {
      const width = Math.max(1, Math.round(w * 0.76));
      return {
        x: Math.round(w * 0.12),
        y: Math.round(h * 0.1),
        width,
        height: Math.max(1, Math.round(width * (9 / 16))),
      };
    }
    const width = Math.max(1, Math.round(w * 0.58));
    return {
      x: Math.round(w * 0.38),
      y: Math.round(h * 0.12),
      width,
      height: Math.max(1, Math.round(width * (9 / 16))),
    };
  }

  function rectOf(spec, w, h) {
    if (spec.special) return specialCam(w, h, spec.special);
    if (spec.c) return camBox(w, h, spec.c[0], spec.c[1], spec.c[2]);
    return fracBox(w, h, spec.f[0], spec.f[1], spec.f[2], spec.f[3]);
  }

  const OVERLAY_PRESETS = [
    {
      id: 'classic-gaming',
      name: 'Classic gaming',
      gameplay: { f: [0, 0, 1, 1] },
      webcam: { c: [0.74, 0.04, 0.22] },
      chat: { f: [0.02, 0.68, 0.28, 0.28] },
      notifications: { f: [0.62, 0.38, 0.34, 0.22] },
    },
    {
      id: 'webcam-focus',
      name: 'Webcam focus',
      gameplay: { f: [0.62, 0.58, 0.34, 0.34] },
      webcam: { special: 'focus' },
      chat: { f: [0.04, 0.36, 0.26, 0.28] },
      notifications: { f: [0.37, 0.04, 0.26, 0.18] },
    },
    {
      id: 'notifications-stack',
      name: 'Notifications stack',
      gameplay: { f: [0, 0, 1, 1] },
      webcam: { c: [0.72, 0.7, 0.24] },
      chat: { f: [0.03, 0.7, 0.3, 0.26] },
      notifications: { f: [0.55, 0.05, 0.4, 0.2] },
    },
    {
      id: 'chat-corner',
      name: 'Chat corner',
      gameplay: { f: [0.06, 0.08, 0.88, 0.72] },
      webcam: { c: [0.03, 0.03, 0.2] },
      chat: { f: [0.58, 0.72, 0.38, 0.24] },
      notifications: { f: [0.04, 0.42, 0.22, 0.2] },
    },
    {
      id: 'balanced-triple',
      name: 'Balanced triple',
      gameplay: { f: [0.1, 0.12, 0.8, 0.62] },
      webcam: { c: [0.76, 0.04, 0.2] },
      chat: { f: [0.04, 0.76, 0.3, 0.2] },
      notifications: { f: [0.36, 0.78, 0.28, 0.18] },
    },
    {
      id: 'pip-left',
      name: 'Gameplay PiP left',
      gameplay: { f: [0.04, 0.62, 0.32, 0.32] },
      webcam: { special: 'left' },
      chat: { f: [0.04, 0.06, 0.28, 0.24] },
      notifications: { f: [0.34, 0.06, 0.3, 0.16] },
    },
    {
      id: 'minimal-cam',
      name: 'Minimal cam',
      gameplay: { f: [0, 0, 1, 1] },
      webcam: { c: [0.03, 0.72, 0.18] },
    },
    {
      id: 'broadcast-lower-third',
      name: 'Broadcast lower third',
      gameplay: { f: [0, 0, 1, 1] },
      webcam: { c: [0.78, 0.05, 0.18] },
      chat: { f: [0.08, 0.78, 0.84, 0.18] },
      notifications: { f: [0.25, 0.04, 0.5, 0.12] },
    },
    {
      id: 'symmetric-pip',
      name: 'Symmetric PiP',
      gameplay: { f: [0.08, 0.1, 0.84, 0.58] },
      webcam: { c: [0.04, 0.72, 0.22] },
      chat: { f: [0.38, 0.72, 0.24, 0.22] },
      notifications: { f: [0.74, 0.72, 0.22, 0.22] },
    },
  ];

  function presetById(id) {
    return OVERLAY_PRESETS.find((preset) => preset.id === id) || null;
  }

  function sourceFrom(id, type, label, rect, zIndex) {
    return {
      id,
      type,
      label,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      zIndex,
    };
  }

  function screenLive() {
    return Boolean(screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live'));
  }

  function webcamLive() {
    return Boolean(webcamStream && webcamStream.getVideoTracks().some((t) => t.readyState === 'live'));
  }

  function buildSceneLayout(w, h) {
    const sources = [];
    const preset = overlayOn ? presetById(overlayPresetId) : null;
    const stub = isStubScene(activeSceneId);
    const desk = activeSceneId === 'desk-only' || isCustomLike(activeSceneId);
    const hasCam = layers.cam && Boolean(webcamStream);
    const imageUrl = sceneImages[activeSceneId];
    const mask = imageUrl ? sceneImageMask(activeSceneId) : null;

    if (preset && !stub) {
      if (layers.game && preset.gameplay) {
        sources.push(sourceFrom('gameplay', 'video', 'Gameplay', rectOf(preset.gameplay, w, h), 0));
      }
      if (preset.chat) sources.push(sourceFrom('chat', 'overlay', 'Chat (placeholder)', rectOf(preset.chat, w, h), 1));
      if (preset.notifications) {
        sources.push(
          sourceFrom('notifications', 'overlay', 'Notifications (placeholder)', rectOf(preset.notifications, w, h), 1),
        );
      }
      if (hasCam && preset.webcam) {
        sources.push(sourceFrom('webcam', 'video', 'Webcam', rectOf(preset.webcam, w, h), 3));
      }
    } else if (preset && stub) {
      if (preset.chat) sources.push(sourceFrom('chat', 'overlay', 'Chat (placeholder)', rectOf(preset.chat, w, h), 1));
      if (preset.notifications) {
        sources.push(
          sourceFrom('notifications', 'overlay', 'Notifications (placeholder)', rectOf(preset.notifications, w, h), 1),
        );
      }
    } else if (!stub && !desk) {
      sources.push(sourceFrom('gameplay', 'video', 'Gameplay', { x: 0, y: 0, width: w, height: h }, 0));
      if (layers.cam && screenStream && webcamStream) {
        const pipW = Math.round(w * 0.22);
        const pipH = Math.round(pipW * (9 / 16));
        sources.push(
          sourceFrom(
            'webcam',
            'video',
            'Webcam',
            { x: w - pipW - 24, y: h - pipH - 24, width: pipW, height: pipH },
            2,
          ),
        );
      }
    } else if (desk && hasCam) {
      sources.push(sourceFrom('webcam', 'video', 'Webcam', { x: 0, y: 0, width: w, height: h }, 0));
    }

    if (mask && imageUrl) {
      let rect = { x: 0, y: 0, width: w, height: h };
      if (mask === 'game-mask-only') {
        const gameplay = sources.find((s) => s.id === 'gameplay');
        if (gameplay) rect = gameplay;
      }
      sources.push(sourceFrom('scene-image', 'overlay', 'Scene image', rect, mask === 'game-mask-only' ? 0 : 1));
    }
    return { canvas: { width: w, height: h }, sources };
  }

  function selectOverlayPreset(id) {
    if (!id) {
      overlayOn = false;
      overlayPresetId = '';
      log('Overlay follows the scene layout.');
    } else {
      const preset = presetById(id);
      if (!preset) return;
      overlayOn = true;
      overlayPresetId = id;
      log(`Overlay: ${preset.name}.`);
    }
    updateButtons();
    if (relayHealth) void postSceneLayout();
  }

  function toggleOverlay() {
    if (overlayOn && overlayPresetId) selectOverlayPreset('');
    else selectOverlayPreset(overlayPresetId || 'classic-gaming');
  }

  function openOverlayMenu(anchor) {
    const items = [{ heading: 'Layout presets' }, {
      label: 'Follow scene layout',
      checked: !overlayOn,
      onSelect: () => selectOverlayPreset(''),
    }];
    for (const preset of OVERLAY_PRESETS) {
      items.push({
        label: preset.name,
        checked: overlayOn && overlayPresetId === preset.id,
        onSelect: () => selectOverlayPreset(preset.id),
      });
    }
    openPopover(anchor, items);
  }

  function programShowsPicture() {
    if (isStubScene(activeSceneId)) return true;
    if (sceneImages[activeSceneId]) return true;
    if (overlayOn && overlayPresetId) return true;
    if (layers.game && screenLive() && !isStubScene(activeSceneId)) return true;
    if (layers.cam && webcamLive() && !isStubScene(activeSceneId)) return true;
    return false;
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
    const spec = profileSpec(normalizeProfile(els.cfgProfile.value));
    const sceneName = activeSceneName();
    const built = buildSceneLayout(spec.width, spec.height);
    const layout = {
      name: sceneName,
      canvas: built.canvas,
      sources: built.sources.map((source) => ({
        id: source.id,
        type: source.type,
        label: source.id === 'gameplay' ? sceneName : source.label,
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        zIndex: source.zIndex,
      })),
    };
    await relayFetch(PATHS.scene, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })
      .then((res) => {
        if (res.ok) log(`POST /scene (${spec.width}×${spec.height}) — ${sceneName}.`);
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

  function drawImageRect(img, x, y, dw, dh) {
    if (!img || dw < 1 || dh < 1) return;
    ctx.drawImage(img, x, y, dw, dh);
  }

  function drawSlot(rect, title, hint) {
    ctx.save();
    ctx.fillStyle = 'rgba(250, 248, 244, 0.92)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 2), Math.max(0, rect.height - 2));
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    ctx.fillStyle = '#1a1408';
    ctx.font = '700 13px "League Spartan", sans-serif';
    ctx.fillText(title.toUpperCase(), cx, cy - 8);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(26, 20, 8, 0.62)';
    ctx.fillText(hint, cx, cy + 12);
    ctx.restore();
  }

  function drawSceneCard(w, h, stub) {
    const pad = Math.round(Math.min(w, h) * 0.06);
    ctx.save();
    ctx.fillStyle = '#f6f1e6';
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    const mark = Math.round(Math.min(w, h) * 0.08);
    const my = h / 2 - mark - 28;
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(w / 2 - mark / 2, my, mark, mark);
    ctx.fillStyle = '#1a1408';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 700 ${Math.round(mark * 0.55)}px "League Spartan", sans-serif`;
    ctx.fillText('M', w / 2, my + mark / 2);
    ctx.font = `800 ${Math.round(Math.min(w, h) * 0.045)}px "League Spartan", sans-serif`;
    ctx.fillText(stub.title.toUpperCase(), w / 2, my + mark + 36);
    ctx.fillStyle = '#6b6256';
    ctx.font = `500 ${Math.round(Math.min(w, h) * 0.028)}px Inter, sans-serif`;
    ctx.fillText(stub.subtitle, w / 2, my + mark + 64);
    ctx.restore();
  }

  function drawWebcamBox(x, y, dw, dh, framed) {
    if (framed) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2, y - 2, dw + 4, dh + 4);
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 2, y - 2, dw + 4, dh + 4);
    }
    drawVideo(webcamStream, x, y, dw, dh, 'cover');
  }

  function drawFrame() {
    resizeCanvas();
    const w = els.canvas.width;
    const h = els.canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const layout = buildSceneLayout(w, h);
    const byId = (id) => layout.sources.find((source) => source.id === id);
    const image = sceneImageElement(activeSceneId);
    const mask = image ? sceneImageMask(activeSceneId) : null;
    const stub = isStubScene(activeSceneId);
    const desk = activeSceneId === 'desk-only' || isCustomLike(activeSceneId);
    const preset = Boolean(overlayOn && overlayPresetId);

    if (stub && !image) {
      const card = SCENE_STUBS[activeSceneId];
      if (card) drawSceneCard(w, h, card);
    } else if (!preset && !stub && !desk) {
      const screenOn = layers.game && screenLive();
      const camOn = layers.cam && webcamLive();
      if (screenOn) drawVideo(screenStream, 0, 0, w, h, 'contain');
      else if (camOn) drawVideo(webcamStream, 0, 0, w, h, 'contain');
      if (screenOn && camOn) {
        const pipW = Math.round(w * 0.22);
        const pipH = Math.round(pipW * (9 / 16));
        drawWebcamBox(w - pipW - 16, h - pipH - 16, pipW, pipH, true);
      }
    } else if (!preset && desk) {
      if (image) drawImageRect(image, 0, 0, w, h);
      if (layers.cam && webcamLive()) drawVideo(webcamStream, 0, 0, w, h, 'contain');
    } else if (stub && image) {
      drawImageRect(image, 0, 0, w, h);
      const chat = byId('chat');
      const notes = byId('notifications');
      if (chat) drawSlot(chat, 'Chat', 'Placeholder until chat feed is wired');
      if (notes) drawSlot(notes, 'Notifications', 'Reserved — not wired yet');
    } else if (preset) {
      const game = byId('gameplay');
      const cam = byId('webcam');
      const chat = byId('chat');
      const notes = byId('notifications');
      const imageSource = byId('scene-image');
      if (image && imageSource && mask === 'full-mask-except-chat') {
        drawImageRect(image, imageSource.x, imageSource.y, imageSource.width, imageSource.height);
      } else if (image && mask === 'game-mask-only') {
        const rect = imageSource || game || { x: 0, y: 0, width: w, height: h };
        drawImageRect(image, rect.x, rect.y, rect.width, rect.height);
      }
      if (game && layers.game && screenLive() && !(image && mask === 'game-mask-only')) {
        drawVideo(screenStream, game.x, game.y, game.width, game.height, 'contain');
      }
      if (cam && webcamLive() && !(image && mask === 'full-mask-except-chat')) {
        drawWebcamBox(cam.x, cam.y, cam.width, cam.height, cam.width < w * 0.9);
      }
      if (chat) drawSlot(chat, 'Chat', 'Placeholder until chat feed is wired');
      if (notes) drawSlot(notes, 'Notifications', 'Reserved — not wired yet');
    }

    const picture = programShowsPicture();
    if (els.programScreen) els.programScreen.classList.toggle('is-live-preview', picture);
    if (els.empty) {
      els.empty.hidden = picture;
      if (!picture) {
        els.empty.textContent = desk
          ? 'Turn on the webcam, or choose a scene image from the scene menu.'
          : 'Select a display or window to start streaming';
      }
    }
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
    return programShowsPicture();
  }

  function updateButtons() {
    const live = Boolean(whipPublisher);
    if (els.btnStop) els.btnStop.disabled = !live;
    if (els.btnScreen) {
      const hidden = !layers.game || isStubScene(activeSceneId);
      els.btnScreen.classList.toggle('is-on', screenLive());
      els.btnScreen.classList.toggle('is-scene-hidden', hidden);
      els.btnScreen.title = hidden
        ? 'This scene hides Game Capture. The capture keeps running.'
        : 'Game Capture';
    }
    if (els.btnWebcam) {
      const hidden = !layers.cam || isStubScene(activeSceneId);
      els.btnWebcam.classList.toggle('is-on', webcamLive());
      els.btnWebcam.classList.toggle('is-scene-hidden', hidden);
      els.btnWebcam.title = hidden
        ? 'This scene hides the webcam. The capture keeps running.'
        : 'Webcam';
    }
    if (els.btnMic) {
      els.btnMic.classList.toggle(
        'is-on',
        Boolean(micStream && micStream.getAudioTracks().some((t) => t.readyState === 'live')),
      );
    }
    if (els.btnOverlay) {
      const preset = overlayOn ? presetById(overlayPresetId) : null;
      els.btnOverlay.classList.toggle('is-on', Boolean(preset));
      els.btnOverlay.title = preset
        ? `Overlay: ${preset.name}. Click to follow the scene layout.`
        : 'Toggle the overlay layout. The menu picks a composition preset.';
    }
    setLiveUi(live);
  }

  async function onStart() {
    if (!hasCapture()) {
      log('Add a game capture or webcam, or switch to a holding scene.');
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
    if (relayHealth) setRelayStatus('ok', `Relay v${relayHealth.version}`);
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
    releaseMic();
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const track = micStream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          releaseMic();
          updateButtons();
        };
      }
      attachMicAudio(micStream);
      log('Microphone added.');
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
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
  els.btnOverlay?.addEventListener('click', () => toggleOverlay());
  els.overlayMenu?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openOverlayMenu(els.overlayMenu);
  });
  els.sceneImageFile?.addEventListener('change', () => {
    const file = els.sceneImageFile.files && els.sceneImageFile.files[0];
    const sceneId = imageTargetSceneId;
    els.sceneImageFile.value = '';
    imageTargetSceneId = '';
    if (!file || !sceneId) return;
    storeSceneImageFile(sceneId, file);
  });
  document.addEventListener('click', (event) => {
    if (!els.popover || els.popover.hidden) return;
    if (els.popover.contains(event.target)) return;
    if (event.target.closest && event.target.closest('.studio-row-menu')) return;
    closePopover();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePopover();
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

  window.addEventListener('resize', resizeCanvas);
  loadScenes();
  loadSceneImages();
  applySceneLayers(activeSceneId);
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
