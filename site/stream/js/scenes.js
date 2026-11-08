/**
 * Maka Stream — Scenes + Sources panel (browser port of Electron studio left rail).
 *
 * Click contract (with preview.js — do not double-fire):
 *   - Source row (.studio-source-toggle) click → toggle layer visibility / enabled only
 *     (toggleLayerForSourceKind). Never starts getDisplayMedia / getUserMedia.
 *   - Source ⋯ menu ([data-source-menu]) → expand/collapse the device/tab picker.
 *     Picker picks start capture: Game → getDisplayMedia; Webcam → getUserMedia(deviceId);
 *     Mic → list audioinputs; capture wired to MakaStreamAudio.setStream('mic').
 *     Display share audio is routed by preview.js (browser tab → game; monitor/window → desktop).
 *   - Capture starts only from Sources ⋯ pickers (preview stage Share / Add webcam removed).
 *     preview must not bind #studio-source-game / #studio-source-webcam row clicks for capture.
 *   - Overlay / Chat / Notifications are desktop-only: visible but greyed out and non-clickable.
 *   - Scene row click → selectScene immediately (program overlay + maka:scene-change).
 *     No desktop-app dialog.
 *
 * Canonical scenes (fixed): Gameplay, Starting Soon, Intermission, Ending.
 *
 * Expected DOM (shell may provide these; otherwise this module builds them under #studio-scenes):
 *
 *   #studio-scenes[data-region="scenes"]
 *     .studio-block
 *       .studio-block-head > h2 (Scenes)
 *       #studio-scenes-list.studio-list.studio-list--scenes
 *         li > button.studio-list-item[data-scene][data-active]
 *           .studio-list-leading.scene-icon
 *           .studio-list-text
 *           .studio-list-menu.studio-list-menu--static
 *     .studio-block
 *       .studio-block-head > h2 (Sources) + #btn-refresh-sources.studio-icon-btn
 *       ul.studio-list.studio-source-list (#studio-sources-list)
 *         li.studio-source-group
 *           button.studio-list-item.studio-source-toggle#studio-source-{game|webcam|mic|browser|chat|notifications}
 *             [data-source-kind][data-enabled][data-active][aria-expanded][aria-controls]
 *             .studio-list-menu[data-source-menu]
 *           ul.studio-source-picker#source-picker-{kind}[hidden]
 *     .studio-footer > #studio-status-dot + #studio-status-text
 *
 * Events (bubbled on #studio-scenes and window):
 *   maka:scene-change   { sceneId, scene, name, card, webcamPip, layers }
 *   maka:scenes-change  { scenes, activeSceneId, customScenes: [] }
 *   maka:sources-change { layers, active }
 *
 * Persists to localStorage key `maka.stream.scenes.v1` (activeSceneId + layers only;
 * custom scenes are ignored and dropped on write). Capture uses browser APIs via preview.
 * Classic script: auto-boots. Module/shell callers: window.initScenes(root?).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'maka.stream.scenes.v1';

  var BUILTIN_SCENES = [
    { id: 'gaming-cam', name: 'Gameplay', icon: '🎮', builtin: true },
    { id: 'starting-soon', name: 'Starting Soon', icon: '▶', builtin: true },
    { id: 'intermission', name: 'Intermission', icon: '❚❚', builtin: true },
    { id: 'ending', name: 'Ending', icon: '■', builtin: true },
  ];

  /** Maka-branded on-program bumper cards (Starting Soon / Intermission / Ending). */
  var BUMPER_PRESETS = {
    'starting-soon': {
      id: 'starting-soon',
      title: 'Starting Soon',
      subtitle: 'Maka is warming up — hang tight',
      brand: 'MAKA',
    },
    intermission: {
      id: 'intermission',
      title: 'Intermission',
      subtitle: 'Be right back — Maka Streams in: --:--',
      brand: 'MAKA',
    },
    ending: {
      id: 'ending',
      title: 'Ending',
      subtitle: 'Thanks for watching with Maka — see you next stream',
      brand: 'MAKA',
    },
  };

  var CANONICAL_IDS = BUILTIN_SCENES.map(function (s) {
    return s.id;
  });

  var SOURCE_KINDS = ['game', 'webcam', 'mic', 'browser', 'chat', 'notifications'];
  var DESKTOP_ONLY_SOURCES = [];
  var MAX_CUSTOM_SCENES = 5;
  var customScenes = [];
  var customMenuId = null;
  var activeOverlayPresetId = '';
  var DESKTOP_ONLY_TITLE = 'Available in Maka desktop (exe) — download for the full experience';

  var SOURCE_META = {
    game: { id: 'studio-source-game', label: 'Game Capture', icon: '🎮', picker: 'source-picker-game', menuLabel: 'Pick display or window' },
    webcam: { id: 'studio-source-webcam', label: 'Webcam', icon: '📹', picker: 'source-picker-webcam', menuLabel: 'Pick camera' },
    mic: { id: 'studio-source-mic', label: 'Microphone', icon: '🎙', picker: 'source-picker-mic', menuLabel: 'Pick microphone' },
    browser: { id: 'studio-source-browser', label: 'Overlay', icon: '🌐', picker: 'source-picker-browser', menuLabel: 'Overlay options' },
    chat: { id: 'studio-source-chat', label: 'Chat', icon: '💬', picker: 'source-picker-chat', menuLabel: 'Pick chat source' },
    notifications: {
      id: 'studio-source-notifications',
      label: 'Notifications',
      icon: '🔔',
      picker: 'source-picker-notifications',
      menuLabel: 'Notification options',
    },
  };

  function isDesktopOnlySource(kind) {
    return DESKTOP_ONLY_SOURCES.indexOf(kind) >= 0;
  }

  /** @type {{ id: string, name: string, icon: string, builtin?: boolean }[]} */
  var scenes = BUILTIN_SCENES.map(cloneScene);
  var activeSceneId = 'gaming-cam';
  var INTERMISSION_MINUTES = [5, 15, 30];
  var intermissionMinutes = 0;
  var intermissionEndsAt = 0;
  var intermissionTimer = 0;
  var intermissionMenuOpen = false;

  function formatCountdown(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return minutes + ':' + (seconds < 10 ? '0' + seconds : String(seconds));
  }

  function intermissionSubtitle() {
    var left = intermissionEndsAt ? formatCountdown(intermissionEndsAt - Date.now()) : '--:--';
    return 'Be right back — Maka Streams in: ' + left;
  }

  function tickIntermission() {
    if (activeSceneId !== 'intermission') return;
    emit('maka:scene-change', previewSceneDetail(findScene('intermission')));
    if (intermissionEndsAt && Date.now() >= intermissionEndsAt) {
      if (intermissionTimer) {
        clearInterval(intermissionTimer);
        intermissionTimer = 0;
      }
    }
  }

  function startIntermissionTimer(minutes) {
    intermissionMinutes = minutes;
    intermissionEndsAt = Date.now() + minutes * 60 * 1000;
    if (intermissionTimer) clearInterval(intermissionTimer);
    intermissionTimer = setInterval(tickIntermission, 250);
    intermissionMenuOpen = false;
    selectScene('intermission');
    renderSceneList();
  }

  var layers = {
    game: true,
    cam: true,
    mic: true,
    browser: false,
    overlay: false,
    chat: false,
    notifications: false,
  };

  var sourceActive = {
    game: false,
    webcam: false,
    mic: false,
    browser: false,
    chat: false,
    notifications: false,
  };

  var expandedSourceKind = null;
  var root = null;
  var scenesList = null;
  var booted = false;

  /** @type {'browser' | 'window' | 'monitor' | null} */
  var selectedDisplaySurface = null;
  /** @type {string} */
  var selectedCameraId = '';
  /** @type {string} */
  var selectedMicId = '';
  /** @type {MediaStream | null} */
  var micCaptureStream = null;
  var previewSyncWired = false;

  function cloneScene(s) {
    return { id: s.id, name: s.name, icon: s.icon, builtin: !!s.builtin };
  }

  function isCanonicalSceneId(id) {
    return CANONICAL_IDS.indexOf(id) >= 0;
  }

  function isBumperSceneId(id) {
    return Object.prototype.hasOwnProperty.call(BUMPER_PRESETS, id);
  }

  function bumperPreset(id) {
    return BUMPER_PRESETS[id] || null;
  }

  function findScene(id) {
    var i;
    for (i = 0; i < scenes.length; i++) {
      if (scenes[i].id === id) return scenes[i];
    }
    for (i = 0; i < customScenes.length; i++) {
      if (customScenes[i].id === id) return customScenes[i];
    }
    return null;
  }

  function readStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeStorage() {
    var payload = {
      activeSceneId: activeSceneId,
      customScenes: customScenes.map(function (scene) {
        return { id: scene.id, name: scene.name };
      }),
      customOrder: [],
      layers: {
        game: !!layers.game,
        cam: !!layers.cam,
        mic: !!layers.mic,
        browser: !!layers.browser,
        overlay: !!layers.overlay,
        chat: !!layers.chat,
        notifications: !!layers.notifications,
      },
      sourceActive: {
        game: !!sourceActive.game,
        webcam: !!sourceActive.webcam,
        mic: !!sourceActive.mic,
        browser: !!sourceActive.browser,
        chat: !!sourceActive.chat,
        notifications: !!sourceActive.notifications,
      },
      overlayPreset: activeOverlayPresetId || '',
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* quota / private mode */
    }
  }

  function loadState() {
    scenes = BUILTIN_SCENES.map(cloneScene);

    var data = readStorage();
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.customScenes)) {
      customScenes = [];
      data.customScenes.forEach(function (item) {
        if (!item || typeof item.id !== 'string' || !/^custom-[1-5]$/.test(item.id)) return;
        if (customScenes.some(function (scene) { return scene.id === item.id; })) return;
        var name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
        customScenes.push({
          id: item.id,
          name: name || 'Custom Scene ' + item.id.replace('custom-', ''),
          icon: '▶',
          builtin: false,
        });
      });
      customScenes = customScenes.slice(0, MAX_CUSTOM_SCENES);
    }

    var wanted = typeof data.activeSceneId === 'string' ? data.activeSceneId : 'gaming-cam';
    activeSceneId =
      isCanonicalSceneId(wanted) || /^custom-[1-5]$/.test(wanted) ? wanted : 'gaming-cam';

    if (data.layers && typeof data.layers === 'object') {
      Object.keys(layers).forEach(function (key) {
        if (typeof data.layers[key] === 'boolean') layers[key] = data.layers[key];
      });
    }
    if (typeof data.overlayPreset === 'string') activeOverlayPresetId = data.overlayPreset;
    if (data.sourceActive && typeof data.sourceActive === 'object') {
      Object.keys(sourceActive).forEach(function (key) {
        if (typeof data.sourceActive[key] === 'boolean') sourceActive[key] = data.sourceActive[key];
      });
    }
  }

  function emit(name, detail) {
    var event = new CustomEvent(name, { bubbles: true, detail: detail });
    if (root) root.dispatchEvent(event);
    global.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail }));
  }

  function previewSceneDetail(scene) {
    var bumper = scene ? bumperPreset(scene.id) : null;
    var webcamPip = scene ? scene.id === 'gaming-cam' : false;
    return {
      sceneId: scene ? scene.id : activeSceneId,
      scene: scene ? cloneScene(scene) : null,
      name: scene ? scene.name : '',
      card: bumper
        ? {
            id: bumper.id,
            title: bumper.title,
            subtitle: bumper.id === 'intermission' ? intermissionSubtitle() : bumper.subtitle,
            brand: bumper.brand,
          }
        : scene && /^custom-[1-5]$/.test(scene.id)
          ? {
              id: scene.id,
              title: scene.name,
              subtitle: 'Custom scene',
              brand: 'MAKA',
            }
          : null,
      webcamPip: webcamPip && layers.cam,
      layers: {
        game: layers.game,
        cam: layers.cam,
        mic: layers.mic,
        browser: layers.browser,
        overlay: layers.overlay,
        chat: layers.chat,
        notifications: layers.notifications,
      },
    };
  }

  function emitAll() {
    writeStorage();
    var scene = findScene(activeSceneId);
    emit('maka:scene-change', previewSceneDetail(scene));
    emit('maka:scenes-change', {
      scenes: scenes.map(cloneScene),
      activeSceneId: activeSceneId,
      customScenes: customScenes.map(function (scene) {
        return { id: scene.id, name: scene.name };
      }),
    });
    emit('maka:sources-change', {
      layers: {
        game: layers.game,
        cam: layers.cam,
        mic: layers.mic,
        browser: layers.browser,
        overlay: layers.overlay,
        chat: layers.chat,
        notifications: layers.notifications,
      },
      active: Object.assign({}, sourceActive),
    });
  }

  function applySceneLayerDefaults(sceneId) {
    if (sceneId === 'gaming-cam') {
      layers.game = true;
      layers.cam = true;
    } else if (isBumperSceneId(sceneId)) {
      layers.game = false;
      layers.cam = false;
    }
  }

  function ensureRoot(mount) {
    if (mount && mount.nodeType === 1) {
      root = mount;
      if (!root.id) root.id = 'studio-scenes';
    } else {
      root = document.getElementById('studio-scenes');
    }
    if (!root) {
      root = document.createElement('aside');
      root.id = 'studio-scenes';
      root.setAttribute('data-region', 'scenes');
      root.setAttribute('aria-label', 'Scenes and sources');
      var host =
        document.querySelector('[data-region="scenes"]') ||
        document.querySelector('.stream-main') ||
        document.querySelector('.app') ||
        document.body;
      if (host && host !== root) {
        if (host.classList && host.classList.contains('stream-main')) {
          host.insertBefore(root, host.firstChild);
        } else {
          host.appendChild(root);
        }
      }
    }
    root.setAttribute('data-region', 'scenes');
    if (!root.getAttribute('aria-label')) {
      root.setAttribute('aria-label', 'Scenes and sources');
    }
    return root;
  }

  function buildShellMarkup() {
    if (root.querySelector('#studio-scenes-list')) return;

    root.innerHTML =
      '<div class="studio-block">' +
      '<header class="studio-block-head"><h2>Scenes</h2></header>' +
      '<ul class="studio-list studio-list--scenes" id="studio-scenes-list" aria-label="Scenes"></ul>' +
      '</div>' +
      '<div class="studio-block">' +
      '<header class="studio-block-head">' +
      '<h2>Sources</h2>' +
      '<button type="button" class="studio-icon-btn" id="btn-refresh-sources" title="Refresh capture lists" aria-label="Refresh capture lists">↻</button>' +
      '</header>' +
      '<ul class="studio-list studio-source-list" aria-label="Source types" id="studio-sources-list"></ul>' +
      '</div>' +
      '<footer class="studio-footer">' +
      '<span class="studio-status-dot" id="studio-status-dot" data-state="ok" aria-hidden="true"></span>' +
      '<span id="studio-status-text">All systems nominal</span>' +
      '</footer>';
  }

  function highlightSceneSelection(sceneId) {
    if (!scenesList) return;
    var buttons = scenesList.querySelectorAll('.studio-list-item[data-scene]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.dataset.active = btn.dataset.scene === sceneId ? '1' : '0';
      btn.setAttribute('aria-current', btn.dataset.scene === sceneId ? 'true' : 'false');
    }
  }

  function builtinButtonId(sceneId) {
    if (sceneId === 'gaming-cam') return 'scene-gameplay';
    if (sceneId === 'starting-soon') return 'scene-starting';
    if (sceneId === 'intermission') return 'scene-intermission';
    if (sceneId === 'ending') return 'scene-ending';
    return '';
  }

  function renderSceneList() {
    if (!scenesList) return;
    scenesList.innerHTML = '';

    scenes.forEach(function (scene) {
      var li = document.createElement('li');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item';
      btn.dataset.scene = scene.id;
      btn.dataset.active = scene.id === activeSceneId ? '1' : '0';
      var bid = builtinButtonId(scene.id);
      if (bid) btn.id = bid;
      btn.setAttribute('aria-current', scene.id === activeSceneId ? 'true' : 'false');

      var leading = document.createElement('span');
      leading.className = 'studio-list-leading scene-icon';
      leading.setAttribute('aria-hidden', 'true');
      leading.textContent = scene.icon || '▶';

      var text = document.createElement('span');
      text.className = 'studio-list-text';
      text.textContent = scene.name;

      var menu = document.createElement('span');
      menu.className = 'studio-list-menu';
      menu.textContent = '⋯';
      if (scene.id === 'intermission') {
        menu.setAttribute('role', 'button');
        menu.tabIndex = 0;
        menu.setAttribute('aria-label', 'Intermission timer');
        menu.setAttribute('aria-expanded', intermissionMenuOpen ? 'true' : 'false');
        menu.setAttribute('aria-controls', 'intermission-timer-menu');
        menu.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          intermissionMenuOpen = !intermissionMenuOpen;
          renderSceneList();
        });
        menu.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          intermissionMenuOpen = !intermissionMenuOpen;
          renderSceneList();
        });
      } else {
        menu.classList.add('studio-list-menu--static');
        menu.setAttribute('aria-hidden', 'true');
      }

      btn.append(leading, text, menu);
      btn.addEventListener('click', function () {
        selectScene(scene.id);
      });

      li.appendChild(btn);
      if (scene.id === 'intermission') {
        var picker = document.createElement('ul');
        picker.id = 'intermission-timer-menu';
        picker.className = 'studio-source-picker';
        picker.setAttribute('role', 'list');
        picker.setAttribute('aria-label', 'Intermission timer');
        picker.hidden = !intermissionMenuOpen;
        INTERMISSION_MINUTES.forEach(function (minutes) {
          var item = document.createElement('li');
          var pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'studio-source-picker-item';
          pick.dataset.active = intermissionMinutes === minutes ? '1' : '0';
          pick.textContent = minutes + ' minutes';
          pick.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            startIntermissionTimer(minutes);
          });
          item.appendChild(pick);
          picker.appendChild(item);
        });
        li.appendChild(picker);
      }
      scenesList.appendChild(li);
    });

    customScenes.forEach(function (scene) {
      var li = document.createElement('li');
      li.dataset.customSceneRow = '1';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item';
      btn.dataset.scene = scene.id;
      btn.dataset.active = scene.id === activeSceneId ? '1' : '0';
      var leading = document.createElement('span');
      leading.className = 'studio-list-leading scene-icon';
      leading.setAttribute('aria-hidden', 'true');
      leading.textContent = '▶';
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'studio-scene-name-input studio-list-text';
      nameInput.value = scene.name;
      nameInput.maxLength = 80;
      nameInput.setAttribute('aria-label', 'Scene name');
      nameInput.addEventListener('click', function (event) { event.stopPropagation(); });
      nameInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') nameInput.blur();
      });
      nameInput.addEventListener('blur', function () {
        var trimmed = nameInput.value.trim().slice(0, 80) || scene.name;
        scene.name = trimmed;
        nameInput.value = trimmed;
        if (activeSceneId === scene.id) emitAll();
        else writeStorage();
      });
      var menu = document.createElement('span');
      menu.className = 'studio-list-menu';
      menu.textContent = '⋯';
      menu.setAttribute('role', 'button');
      menu.tabIndex = 0;
      menu.setAttribute('aria-label', 'Remove custom scene');
      menu.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        customScenes = customScenes.filter(function (item) { return item.id !== scene.id; });
        if (activeSceneId === scene.id) activeSceneId = 'gaming-cam';
        renderSceneList();
        emitAll();
      });
      btn.append(leading, nameInput, menu);
      btn.addEventListener('click', function () { selectScene(scene.id); });
      li.appendChild(btn);
      scenesList.appendChild(li);
    });

    if (customScenes.length < MAX_CUSTOM_SCENES) {
      var addRow = document.createElement('li');
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'studio-list-item';
      addBtn.id = 'btn-add-scene';
      addBtn.title = 'Add scene (' + customScenes.length + ' of ' + MAX_CUSTOM_SCENES + ')';
      addBtn.innerHTML =
        '<span class="studio-list-leading scene-icon" aria-hidden="true">+</span>' +
        '<span class="studio-list-text">Add scene</span>';
      addBtn.addEventListener('click', function () {
        var slot = 0;
        var i;
        for (i = 1; i <= MAX_CUSTOM_SCENES; i++) {
          var id = 'custom-' + i;
          if (!customScenes.some(function (item) { return item.id === id; })) {
            slot = i;
            break;
          }
        }
        if (!slot) return;
        customScenes.push({
          id: 'custom-' + slot,
          name: 'Custom Scene ' + slot,
          icon: '▶',
          builtin: false,
        });
        activeSceneId = 'custom-' + slot;
        renderSceneList();
        emitAll();
      });
      addRow.appendChild(addBtn);
      scenesList.appendChild(addRow);
    }
  }

  function layerEnabledForKind(kind) {
    if (kind === 'game') return layers.game;
    if (kind === 'webcam') return layers.cam;
    if (kind === 'mic') return layers.mic;
    if (kind === 'browser') return layers.browser || layers.overlay;
    if (kind === 'chat') return layers.chat;
    if (kind === 'notifications') return layers.notifications;
    return false;
  }

  function applyDesktopOnlySourceUi(kind, btn) {
    if (!btn || !isDesktopOnlySource(kind)) return;
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.dataset.desktopOnly = '1';
    btn.title = DESKTOP_ONLY_TITLE;
    btn.setAttribute('aria-expanded', 'false');
    if (btn.parentElement && btn.parentElement.classList.contains('studio-source-group')) {
      btn.parentElement.dataset.desktopOnly = '1';
    }
    var menu = btn.querySelector('[data-source-menu], .studio-list-menu');
    if (menu) {
      menu.classList.add('studio-list-menu--static');
      menu.removeAttribute('role');
      menu.removeAttribute('tabindex');
      menu.removeAttribute('data-source-menu');
      menu.setAttribute('aria-hidden', 'true');
    }
    var picker = document.getElementById(SOURCE_META[kind].picker);
    if (picker) {
      picker.hidden = true;
      picker.innerHTML = '';
    }
  }

  function syncSourceRows() {
    SOURCE_KINDS.forEach(function (kind) {
      var el = document.getElementById(SOURCE_META[kind].id);
      if (!el) return;
      if (isDesktopOnlySource(kind)) {
        applyDesktopOnlySourceUi(kind, el);
        el.dataset.enabled = '0';
        el.dataset.active = '0';
        return;
      }
      el.dataset.enabled = layerEnabledForKind(kind) ? '1' : '0';
      el.dataset.active = sourceActive[kind] ? '1' : '0';
      el.setAttribute('aria-expanded', expandedSourceKind === kind ? 'true' : 'false');
      var menu = el.querySelector('[data-source-menu]');
      if (menu) menu.setAttribute('aria-expanded', expandedSourceKind === kind ? 'true' : 'false');
    });
  }

  function syncSourcePickerVisibility() {
    SOURCE_KINDS.forEach(function (kind) {
      var picker = document.getElementById(SOURCE_META[kind].picker);
      if (!picker) return;
      if (isDesktopOnlySource(kind)) {
        picker.hidden = true;
        return;
      }
      var open = expandedSourceKind === kind;
      picker.hidden = !open;
      if (open) renderSourcePicker(kind);
    });
    syncSourceRows();
  }

  function appendPickerStatus(picker, text) {
    var li = document.createElement('li');
    var p = document.createElement('p');
    p.className = 'studio-source-picker-status';
    p.textContent = text;
    li.appendChild(p);
    picker.appendChild(li);
  }

  function appendPickerSection(picker, title) {
    var li = document.createElement('li');
    li.className = 'studio-source-picker-section';
    var p = document.createElement('p');
    p.className = 'studio-source-picker-section-title';
    p.textContent = title;
    li.appendChild(p);
    picker.appendChild(li);
  }

  function appendPickerButton(picker, label, active, onPick) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'studio-source-picker-item';
    btn.dataset.active = active ? '1' : '0';
    btn.textContent = label;
    btn.addEventListener('click', onPick);
    li.appendChild(btn);
    picker.appendChild(li);
  }

  function getPreviewApi() {
    if (typeof global === 'undefined') return null;
    return global.MakaStreamPreview || global.MakaPreview || null;
  }

  function getAudioApi() {
    if (typeof global === 'undefined') return null;
    return global.MakaStreamAudio || null;
  }

  function stopMicCapture() {
    if (micCaptureStream) {
      micCaptureStream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (err) {
          /* ignore */
        }
      });
      micCaptureStream = null;
    }
    var audio = getAudioApi();
    if (audio && typeof audio.clearStream === 'function') {
      try {
        audio.clearStream('mic');
      } catch (err) {
        /* ignore */
      }
    }
  }

  function listMediaInputs(kind) {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return Promise.resolve([]);
    }
    return Promise.race([
      navigator.mediaDevices.enumerateDevices(),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('enumerateDevices timeout'));
        }, 1500);
      }),
    ])
      .then(function (devices) {
        var out = [];
        for (var i = 0; i < devices.length; i++) {
          if (devices[i].kind === kind) out.push(devices[i]);
        }
        return out;
      })
      .catch(function () {
        return [];
      });
  }

  function deviceLabel(device, fallbackPrefix, index) {
    var label = device && device.label ? String(device.label).trim() : '';
    if (label) return label;
    return fallbackPrefix + ' ' + (index + 1);
  }

  function markSourceActive(kind, active) {
    sourceActive[kind] = !!active;
    if (active) {
      if (kind === 'game') layers.game = true;
      if (kind === 'webcam') layers.cam = true;
      if (kind === 'mic') layers.mic = true;
    }
  }

  function pickGameSurface(surface) {
    var preview = getPreviewApi();
    selectedDisplaySurface = surface;
    if (!preview || typeof preview.startScreen !== 'function') {
      console.warn('[scenes] preview API missing — cannot start display capture');
      selectedDisplaySurface = null;
      return;
    }
    void preview.startScreen({ displaySurface: surface }).then(function (stream) {
      if (stream) {
        markSourceActive('game', true);
      } else {
        // User cancelled or UA denied — keep prior state unless no live screen.
        var streams = typeof preview.getStreams === 'function' ? preview.getStreams() : null;
        markSourceActive('game', Boolean(streams && streams.screen));
        if (!streams || !streams.screen) selectedDisplaySurface = null;
      }
      syncSourcePickerVisibility();
      emitAll();
    });
  }

  function stopGameCapture() {
    var preview = getPreviewApi();
    if (preview && typeof preview.stopScreen === 'function') preview.stopScreen();
    selectedDisplaySurface = null;
    markSourceActive('game', false);
    syncSourcePickerVisibility();
    emitAll();
  }

  function pickWebcamDevice(deviceId) {
    var preview = getPreviewApi();
    selectedCameraId = deviceId || '';
    if (!preview || typeof preview.startWebcam !== 'function') {
      return;
    }
    void preview.startWebcam({ deviceId: deviceId || undefined }).then(function (stream) {
      if (stream) {
        markSourceActive('webcam', true);
      } else {
        var streams = typeof preview.getStreams === 'function' ? preview.getStreams() : null;
        markSourceActive('webcam', Boolean(streams && streams.webcam));
        if (!streams || !streams.webcam) selectedCameraId = '';
      }
      syncSourcePickerVisibility();
      emitAll();
    });
  }

  function stopWebcamCapture() {
    var preview = getPreviewApi();
    if (preview && typeof preview.stopWebcam === 'function') preview.stopWebcam();
    selectedCameraId = '';
    markSourceActive('webcam', false);
    syncSourcePickerVisibility();
    emitAll();
  }

  function pickMicDevice(deviceId) {
    selectedMicId = deviceId || '';
    stopMicCapture();
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.warn('[scenes] getUserMedia unavailable for microphone');
      selectedMicId = '';
      markSourceActive('mic', false);
      syncSourcePickerVisibility();
      emitAll();
      return;
    }
    var constraints = deviceId
      ? { audio: { deviceId: { exact: deviceId } }, video: false }
      : { audio: true, video: false };
    void navigator.mediaDevices
      .getUserMedia(constraints)
      .then(function (stream) {
        micCaptureStream = stream;
        var track = stream.getAudioTracks()[0];
        if (track) {
          track.addEventListener('ended', function () {
            if (micCaptureStream === stream) {
              micCaptureStream = null;
              var audioEnded = getAudioApi();
              if (audioEnded && typeof audioEnded.clearStream === 'function') {
                try {
                  audioEnded.clearStream('mic');
                } catch (err) {
                  /* ignore */
                }
              }
              markSourceActive('mic', false);
              selectedMicId = '';
              syncSourceRows();
              emitAll();
            }
          });
        }
        var audio = getAudioApi();
        if (audio && typeof audio.setStream === 'function') {
          audio.setStream('mic', stream);
        }
        markSourceActive('mic', true);
        syncSourcePickerVisibility();
        emitAll();
      })
      .catch(function (err) {
        console.warn('[scenes] mic getUserMedia failed', err);
        selectedMicId = '';
        markSourceActive('mic', false);
        syncSourcePickerVisibility();
        emitAll();
      });
  }

  function stopMicSource() {
    stopMicCapture();
    selectedMicId = '';
    markSourceActive('mic', false);
    syncSourcePickerVisibility();
    emitAll();
  }

  function renderGamePicker(picker) {
    appendPickerSection(picker, 'Share');
    appendPickerStatus(
      picker,
      'Opens the browser share dialog. Labels match what the browser allows (tab / window / screen).',
    );
    var options = [
      { label: 'Browser tab', surface: 'browser' },
      { label: 'Window', surface: 'window' },
      { label: 'Screen', surface: 'monitor' },
    ];
    options.forEach(function (opt) {
      appendPickerButton(
        picker,
        opt.label,
        sourceActive.game && selectedDisplaySurface === opt.surface,
        function () {
          pickGameSurface(opt.surface);
        },
      );
    });
    if (sourceActive.game) {
      appendPickerButton(picker, 'Stop sharing', false, function () {
        stopGameCapture();
      });
    }
  }

  function renderWebcamPicker(picker) {
    appendPickerStatus(picker, 'Looking for cameras…');
    void listMediaInputs('videoinput').then(function (devices) {
      if (expandedSourceKind !== 'webcam') return;
      picker.innerHTML = '';
      if (!devices.length) {
        appendPickerStatus(picker, 'Not available');
        return;
      }
      appendPickerSection(picker, 'Cameras');
      devices.forEach(function (device, index) {
        var id = device.deviceId || '';
        appendPickerButton(
          picker,
          deviceLabel(device, 'Camera', index),
          sourceActive.webcam && selectedCameraId === id,
          function () {
            pickWebcamDevice(id);
          },
        );
      });
      if (sourceActive.webcam) {
        appendPickerButton(picker, 'Stop webcam', false, function () {
          stopWebcamCapture();
        });
      }
    });
  }

  function renderMicPicker(picker) {
    appendPickerStatus(picker, 'Looking for microphones…');
    void listMediaInputs('audioinput').then(function (devices) {
      if (expandedSourceKind !== 'mic') return;
      picker.innerHTML = '';
      if (!devices.length) {
        appendPickerStatus(picker, 'Not available');
        appendPickerStatus(
          picker,
          'Row click still toggles mic layer visibility. Pick a mic here to drive the mixer meter.',
        );
        return;
      }
      appendPickerSection(picker, 'Microphones');
      devices.forEach(function (device, index) {
        var id = device.deviceId || '';
        appendPickerButton(
          picker,
          deviceLabel(device, 'Microphone', index),
          sourceActive.mic && selectedMicId === id,
          function () {
            pickMicDevice(id);
          },
        );
      });
      if (sourceActive.mic) {
        appendPickerButton(picker, 'Stop microphone', false, function () {
          stopMicSource();
        });
      }
    });
  }

  function setProgramSlot(id, visible) {
    var el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }

  var FULL_FRAME = { left: '0', top: '0', right: 'auto', bottom: 'auto', width: '100%', height: '100%', aspect: 'auto', z: '1' };
  var PIP_TOP_RIGHT = { left: 'auto', right: '2%', top: '3%', bottom: 'auto', width: '24%', height: 'auto', aspect: '16 / 9', z: '4' };
  var PIP_BOTTOM_RIGHT = { left: 'auto', right: '2%', top: 'auto', bottom: '3%', width: '24%', height: 'auto', aspect: '16 / 9', z: '4' };
  var PIP_BOTTOM_LEFT = { left: '2%', right: 'auto', top: 'auto', bottom: '3%', width: '24%', height: 'auto', aspect: '16 / 9', z: '4' };
  var CHAT_TALL_LEFT = { left: '2%', right: 'auto', top: '28%', bottom: 'auto', width: '26%', height: '68%', aspect: 'auto', z: '5' };
  var CHAT_ABOVE_CAM = { left: '2%', right: 'auto', top: '4%', bottom: 'auto', width: '24%', height: '62%', aspect: 'auto', z: '5' };
  var CHAT_CENTER_RIGHT = { left: 'auto', right: '2%', top: '12%', bottom: 'auto', width: '26%', height: '52%', aspect: 'auto', z: '5' };
  var NOTES_CENTER = { left: '34%', right: 'auto', top: '40%', bottom: 'auto', width: '32%', height: '16%', aspect: 'auto', z: '6' };

  var OVERLAY_LAYOUTS = {
    'classic-gaming': {
      label: 'Game full, cam top-right',
      game: FULL_FRAME,
      cam: PIP_TOP_RIGHT,
      chat: CHAT_TALL_LEFT,
      notes: NOTES_CENTER,
    },
    'game-cam-bottom-left': {
      label: 'Game full, cam bottom-left',
      game: FULL_FRAME,
      cam: PIP_BOTTOM_LEFT,
      chat: CHAT_ABOVE_CAM,
      notes: NOTES_CENTER,
    },
    'game-cam-bottom-right': {
      label: 'Game full, cam bottom-right',
      game: FULL_FRAME,
      cam: PIP_BOTTOM_RIGHT,
      chat: CHAT_TALL_LEFT,
      notes: NOTES_CENTER,
    },
    'cam-main-game-top-right': {
      label: 'Cam full, game top-right',
      game: Object.assign({}, PIP_TOP_RIGHT, { width: '26%', z: '4' }),
      cam: Object.assign({}, FULL_FRAME, { z: '1' }),
      chat: CHAT_TALL_LEFT,
      notes: NOTES_CENTER,
    },
    'cam-main-game-bottom-right': {
      label: 'Cam full, game bottom-right',
      game: Object.assign({}, PIP_BOTTOM_RIGHT, { width: '26%', z: '4' }),
      cam: Object.assign({}, FULL_FRAME, { z: '1' }),
      chat: CHAT_TALL_LEFT,
      notes: NOTES_CENTER,
    },
    'cam-full-chat-right': {
      label: 'Cam full, chat right',
      game: Object.assign({}, PIP_BOTTOM_RIGHT, { width: '26%', z: '4' }),
      cam: Object.assign({}, FULL_FRAME, { z: '1' }),
      chat: CHAT_CENTER_RIGHT,
      notes: NOTES_CENTER,
    },
  };

  function placeProgramBox(el, box) {
    if (!el) return;
    var keys = ['left', 'right', 'top', 'bottom', 'width', 'height', 'aspectRatio', 'zIndex'];
    if (!box) {
      keys.forEach(function (key) {
        el.style[key] = '';
      });
      return;
    }
    el.style.left = box.left || '';
    el.style.right = box.right || 'auto';
    el.style.top = box.top || '';
    el.style.bottom = box.bottom || 'auto';
    el.style.width = box.width || '';
    el.style.height = box.height || '';
    el.style.aspectRatio = box.aspect || '';
    el.style.zIndex = box.z || '';
  }

  function applyOverlayLayout(presetId) {
    var layout = OVERLAY_LAYOUTS[presetId] || null;
    var game = document.getElementById('program-video');
    var cam = document.getElementById('program-cam');
    var chat = document.getElementById('program-chat-slot');
    var notes = document.getElementById('program-notifications-slot');
    if (!layout) {
      placeProgramBox(game, null);
      placeProgramBox(cam, null);
      placeProgramBox(chat, null);
      placeProgramBox(notes, null);
      if (chat) chat.hidden = !layers.chat;
      if (notes) notes.hidden = !layers.notifications;
      if (layers.chat) placeProgramBox(chat, CHAT_TALL_LEFT);
      if (layers.notifications) placeProgramBox(notes, NOTES_CENTER);
      return;
    }
    placeProgramBox(game, layout.game);
    placeProgramBox(cam, layout.cam);
    placeProgramBox(chat, layout.chat);
    placeProgramBox(notes, layout.notes);
    if (chat) chat.hidden = false;
    if (notes) notes.hidden = false;
  }

  function renderOverlayPicker(picker) {
    var presets = [{ id: '', label: 'Follow scene' }].concat(
      Object.keys(OVERLAY_LAYOUTS).map(function (id) {
        return { id: id, label: OVERLAY_LAYOUTS[id].label };
      }),
    );
    appendPickerSection(picker, 'Overlay layouts');
    presets.forEach(function (preset) {
      appendPickerButton(picker, preset.label, activeOverlayPresetId === preset.id, function () {
        activeOverlayPresetId = preset.id;
        var layout = OVERLAY_LAYOUTS[preset.id];
        layers.overlay = Boolean(layout);
        layers.chat = Boolean(layout);
        layers.notifications = Boolean(layout);
        sourceActive.browser = layers.overlay;
        sourceActive.chat = layers.chat;
        sourceActive.notifications = layers.notifications;
        applyOverlayLayout(preset.id);
        syncSourceRows();
        emitAll();
        renderSourcePicker('browser');
      });
    });
  }

  function renderChatPicker(picker) {
    appendPickerButton(picker, 'Chat off', !layers.chat, function () {
      layers.chat = false;
      sourceActive.chat = false;
      setProgramSlot('program-chat-slot', false);
      syncSourceRows();
      emitAll();
      renderSourcePicker('chat');
    });
    appendPickerButton(picker, 'Tall chat log', layers.chat, function () {
      layers.chat = true;
      sourceActive.chat = true;
      applyOverlayLayout(activeOverlayPresetId);
      syncSourceRows();
      emitAll();
      renderSourcePicker('chat');
    });
  }

  function renderNotificationsPicker(picker) {
    appendPickerButton(picker, 'Notifications off', !layers.notifications, function () {
      layers.notifications = false;
      sourceActive.notifications = false;
      setProgramSlot('program-notifications-slot', false);
      syncSourceRows();
      emitAll();
      renderSourcePicker('notifications');
    });
    appendPickerButton(picker, 'Center overlay', layers.notifications, function () {
      layers.notifications = true;
      sourceActive.notifications = true;
      applyOverlayLayout(activeOverlayPresetId);
      syncSourceRows();
      emitAll();
      renderSourcePicker('notifications');
    });
  }

  function renderSourcePicker(kind) {
    var picker = document.getElementById(SOURCE_META[kind].picker);
    if (!picker) return;
    picker.innerHTML = '';

    if (kind === 'game') {
      renderGamePicker(picker);
      return;
    }
    if (kind === 'webcam') {
      renderWebcamPicker(picker);
      return;
    }
    if (kind === 'mic') {
      renderMicPicker(picker);
      return;
    }
    if (kind === 'browser') {
      renderOverlayPicker(picker);
      return;
    }
    if (kind === 'chat') {
      renderChatPicker(picker);
      return;
    }
    if (kind === 'notifications') {
      renderNotificationsPicker(picker);
      return;
    }

    // Overlay / Chat / Notifications are desktop-only — no picker UI on web.
    if (isDesktopOnlySource(kind)) {
      picker.hidden = true;
      return;
    }
  }

  function wireSourceToggle(kind, btn) {
    if (btn.dataset.scenesWired === '1') return;
    if (isDesktopOnlySource(kind)) {
      applyDesktopOnlySourceUi(kind, btn);
      btn.dataset.scenesWired = '1';
      return;
    }
    // Row body = layer on/off only. Capture starts from the ⋯ picker.
    if (!btn.title) {
      btn.title = 'Toggle layer visibility';
    }
    btn.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('[data-source-menu]')) return;
      toggleLayerForSourceKind(kind);
    });

    var menu = btn.querySelector('[data-source-menu]');
    if (menu) {
      function onMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleSourcePicker(kind);
      }
      menu.addEventListener('click', onMenu);
      menu.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        onMenu(event);
      });
    }
    btn.dataset.scenesWired = '1';
  }

  function renderSourcesList() {
    var list = document.getElementById('studio-sources-list');
    if (!list) {
      list = root.querySelector('.studio-source-list');
      if (!list) return;
      if (!list.id) list.id = 'studio-sources-list';
    }
    if (list.children.length && list.querySelector('.studio-source-toggle')) {
      SOURCE_KINDS.forEach(function (kind) {
        var meta = SOURCE_META[kind];
        var btn = document.getElementById(meta.id);
        var picker = document.getElementById(meta.picker);
        if (btn) wireSourceToggle(kind, btn);
        if (!picker && btn && btn.parentElement) {
          picker = document.createElement('ul');
          picker.className = 'studio-source-picker';
          picker.id = meta.picker;
          picker.hidden = true;
          picker.setAttribute('role', 'list');
          btn.parentElement.appendChild(picker);
        }
      });
      syncSourcePickerVisibility();
      return;
    }

    list.innerHTML = '';
    SOURCE_KINDS.forEach(function (kind) {
      var meta = SOURCE_META[kind];
      var desktopOnly = isDesktopOnlySource(kind);
      var li = document.createElement('li');
      li.className = 'studio-source-group';
      if (desktopOnly) li.dataset.desktopOnly = '1';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item studio-source-toggle';
      btn.id = meta.id;
      btn.dataset.sourceKind = kind;
      btn.setAttribute('aria-controls', meta.picker);

      var leading = document.createElement('span');
      leading.className = 'studio-list-leading source-icon';
      leading.setAttribute('aria-hidden', 'true');
      leading.textContent = meta.icon;

      var text = document.createElement('span');
      text.className = 'studio-list-text';
      text.textContent = meta.label;

      var menu = document.createElement('span');
      menu.className = desktopOnly ? 'studio-list-menu studio-list-menu--static' : 'studio-list-menu';
      menu.textContent = '⋯';
      if (desktopOnly) {
        menu.setAttribute('aria-hidden', 'true');
      } else {
        menu.setAttribute('role', 'button');
        menu.tabIndex = 0;
        menu.dataset.sourceMenu = kind;
        menu.setAttribute('aria-label', meta.menuLabel);
        menu.title = meta.menuLabel;
      }

      btn.append(leading, text, menu);

      var picker = document.createElement('ul');
      picker.className = 'studio-source-picker';
      picker.id = meta.picker;
      picker.hidden = true;
      picker.setAttribute('role', 'list');
      picker.setAttribute('aria-label', meta.label);

      li.append(btn, picker);
      list.appendChild(li);
      wireSourceToggle(kind, btn);
    });

    var refresh = document.getElementById('btn-refresh-sources');
    if (refresh && refresh.dataset.scenesWired !== '1') {
      refresh.addEventListener('click', function () {
        if (expandedSourceKind) renderSourcePicker(expandedSourceKind);
        var status = document.getElementById('studio-status-text');
        if (status) status.textContent = 'Source lists refreshed';
        setTimeout(function () {
          if (status) status.textContent = 'All systems nominal';
        }, 1600);
      });
      refresh.dataset.scenesWired = '1';
    }

    syncSourcePickerVisibility();
  }

  function wirePreviewSync() {
    if (previewSyncWired || typeof global === 'undefined' || !global.addEventListener) return;
    previewSyncWired = true;
    global.addEventListener('maka:preview-change', function (ev) {
      var detail = (ev && ev.detail) || {};
      var changed = false;
      if (typeof detail.hasScreen === 'boolean' && sourceActive.game !== detail.hasScreen) {
        sourceActive.game = detail.hasScreen;
        if (!detail.hasScreen) selectedDisplaySurface = null;
        changed = true;
      }
      if (typeof detail.hasWebcam === 'boolean' && sourceActive.webcam !== detail.hasWebcam) {
        sourceActive.webcam = detail.hasWebcam;
        if (!detail.hasWebcam) selectedCameraId = '';
        changed = true;
      }
      if (!changed) return;
      syncSourceRows();
      if (expandedSourceKind === 'game' || expandedSourceKind === 'webcam') {
        renderSourcePicker(expandedSourceKind);
      }
      writeStorage();
      emit('maka:sources-change', {
        layers: {
          game: layers.game,
          cam: layers.cam,
          mic: layers.mic,
          browser: layers.browser,
          overlay: layers.overlay,
          chat: layers.chat,
          notifications: layers.notifications,
        },
        active: Object.assign({}, sourceActive),
      });
    });
  }

  function toggleSourcePicker(kind) {
    if (isDesktopOnlySource(kind)) return;
    expandedSourceKind = expandedSourceKind === kind ? null : kind;
    syncSourcePickerVisibility();
  }

  function toggleLayerForSourceKind(kind) {
    if (isDesktopOnlySource(kind)) return;
    if (kind === 'game') {
      layers.game = !layers.game;
    } else if (kind === 'webcam') {
      layers.cam = !layers.cam;
    } else if (kind === 'mic') {
      layers.mic = !layers.mic;
    } else if (kind === 'browser') {
      var showing = layers.browser || layers.overlay;
      if (showing) {
        layers.overlay = false;
        layers.browser = false;
        sourceActive.browser = false;
      } else {
        layers.overlay = true;
        sourceActive.browser = true;
      }
    } else if (kind === 'chat') {
      layers.chat = !layers.chat;
      sourceActive.chat = layers.chat;
    } else if (kind === 'notifications') {
      layers.notifications = !layers.notifications;
      sourceActive.notifications = layers.notifications;
    }
    syncSourceRows();
    emitAll();
  }

  function selectScene(sceneId) {
    if (!findScene(sceneId)) return;
    activeSceneId = sceneId;
    applySceneLayerDefaults(sceneId);
    highlightSceneSelection(sceneId);
    syncSourceRows();
    emitAll();
  }

  function api() {
    return {
      getState: function () {
        return {
          scenes: scenes.map(cloneScene),
          activeSceneId: activeSceneId,
          layers: Object.assign({}, layers),
          sourceActive: Object.assign({}, sourceActive),
        };
      },
      selectScene: selectScene,
      /** @deprecated Custom scenes removed — no-op for back-compat. */
      addScene: function () {
        return null;
      },
      /** @deprecated Custom scenes removed — no-op for back-compat. */
      deleteScene: function () {
        return false;
      },
      toggleSource: toggleLayerForSourceKind,
      refresh: function () {
        renderSceneList();
        renderSourcesList();
        syncSourceRows();
      },
      root: function () {
        return root;
      },
    };
  }

  function initScenes(mount) {
    loadState();
    ensureRoot(mount || null);
    buildShellMarkup();
    scenesList = document.getElementById('studio-scenes-list') || root.querySelector('#studio-scenes-list');
    if (!scenesList) return api();

    applySceneLayerDefaults(activeSceneId);
    renderSceneList();
    renderSourcesList();
    highlightSceneSelection(activeSceneId);
    syncSourceRows();
    wirePreviewSync();
    if (activeOverlayPresetId && !OVERLAY_LAYOUTS[activeOverlayPresetId]) activeOverlayPresetId = '';
    applyOverlayLayout(activeOverlayPresetId);
    document.addEventListener('click', function (event) {
      if (!intermissionMenuOpen) return;
      var target = event.target;
      if (target && target.closest && target.closest('#scene-intermission, #intermission-timer-menu')) return;
      intermissionMenuOpen = false;
      renderSceneList();
    });
    emitAll();
    booted = true;
    global.MakaScenes = api();
    return global.MakaScenes;
  }

  global.initScenes = initScenes;

  function autoBoot() {
    if (booted) return;
    if (typeof document === 'undefined') return;
    initScenes();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoBoot);
    } else {
      autoBoot();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);

export function initScenes(mount) {
  if (typeof window !== 'undefined' && typeof window.initScenes === 'function') {
    return window.initScenes(mount);
  }
  return null;
}
