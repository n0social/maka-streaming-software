/**
 * Maka Stream — Scenes + Sources panel (browser port of Electron studio left rail).
 *
 * Expected DOM (shell may provide these; otherwise this module builds them under #studio-scenes):
 *
 *   #studio-scenes[data-region="scenes"]
 *     .studio-block
 *       .studio-block-head > h2 (Scenes)
 *       #studio-scenes-list.studio-list.studio-list--scenes
 *         li > button.studio-list-item[data-scene][data-active]
 *           .studio-list-leading.scene-icon
 *           .studio-list-text  |  input.studio-scene-name-input.studio-list-text (custom)
 *           .studio-list-menu[data-scene-menu]  |  .studio-list-menu--static
 *         #studio-add-scene-row > #btn-add-scene-alt.studio-list-add
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
 *   maka:scenes-change  { scenes, activeSceneId, customScenes }
 *   maka:sources-change { layers, active }
 *
 * Persists to localStorage key `maka.stream.scenes.v1`. No native capture.
 * Classic script: auto-boots. Module/shell callers: window.initScenes(root?).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'maka.stream.scenes.v1';
  var MAX_CUSTOM_SCENES = 3;
  var CUSTOM_SCENE_ID_RE = /^custom-[1-3]$/;

  var BUILTIN_SCENES = [
    { id: 'gaming-cam', name: 'Gameplay', icon: '🎮', builtin: true, menuStatic: true },
    { id: 'starting-soon', name: 'Starting Soon', icon: '📄', builtin: true },
    { id: 'desk-only', name: 'Just Chatting', icon: '▶️', builtin: true },
    { id: 'intermission', name: 'Intermission', icon: '⏸️', builtin: true },
    { id: 'ending', name: 'Ending Scene', icon: '🏠', builtin: true },
  ];

  var STUB_PRESETS = {
    'starting-soon': {
      id: 'starting-soon',
      title: 'Starting Soon',
      subtitle: 'Hang tight — we’ll be live in a moment',
    },
    intermission: {
      id: 'intermission',
      title: 'Intermission',
      subtitle: 'Short break — back shortly',
    },
    ending: {
      id: 'ending',
      title: 'Ending Scene',
      subtitle: 'Thanks for watching',
    },
  };

  var SOURCE_KINDS = ['game', 'webcam', 'mic', 'browser', 'chat', 'notifications'];

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

  /** @type {{ id: string, name: string, icon: string, builtin?: boolean, menuStatic?: boolean }[]} */
  var scenes = BUILTIN_SCENES.map(cloneScene);
  var activeSceneId = 'gaming-cam';
  var customOrder = [];

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
  var contextMenu = null;
  var booted = false;

  function cloneScene(s) {
    return { id: s.id, name: s.name, icon: s.icon, builtin: !!s.builtin, menuStatic: !!s.menuStatic };
  }

  function isCustomSceneId(id) {
    return CUSTOM_SCENE_ID_RE.test(id);
  }

  function isStubSceneId(id) {
    return Object.prototype.hasOwnProperty.call(STUB_PRESETS, id);
  }

  function stubPreset(id) {
    return STUB_PRESETS[id] || null;
  }

  function defaultCustomSceneName(id) {
    return 'Custom Scene ' + String(id).replace('custom-', '');
  }

  function nextCustomSceneId(existing) {
    for (var i = 1; i <= MAX_CUSTOM_SCENES; i++) {
      var id = 'custom-' + i;
      if (!existing.some(function (s) { return s.id === id; })) return id;
    }
    return null;
  }

  function customScenes() {
    return scenes.filter(function (s) { return isCustomSceneId(s.id); });
  }

  function customCount() {
    return customScenes().length;
  }

  function findScene(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].id === id) return scenes[i];
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
      customScenes: customScenes().map(function (s) {
        return { id: s.id, name: s.name };
      }),
      customOrder: customOrder.slice(),
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
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* quota / private mode */
    }
  }

  function loadState() {
    var data = readStorage();
    if (!data || typeof data !== 'object') return;

    var nextCustoms = [];
    var rawCustoms = Array.isArray(data.customScenes) ? data.customScenes : [];
    for (var i = 0; i < rawCustoms.length; i++) {
      var item = rawCustoms[i];
      if (!item || typeof item !== 'object') continue;
      var id = typeof item.id === 'string' ? item.id.trim() : '';
      if (!isCustomSceneId(id)) continue;
      if (nextCustoms.some(function (s) { return s.id === id; })) continue;
      var nameRaw = typeof item.name === 'string' ? item.name : '';
      var name = nameRaw.trim().slice(0, 80) || defaultCustomSceneName(id);
      nextCustoms.push({ id: id, name: name, icon: '▶️', builtin: false });
      if (nextCustoms.length >= MAX_CUSTOM_SCENES) break;
    }

    if (Array.isArray(data.customOrder)) {
      customOrder = data.customOrder.filter(function (cid) {
        return nextCustoms.some(function (s) { return s.id === cid; });
      });
    }
    nextCustoms.forEach(function (s) {
      if (customOrder.indexOf(s.id) < 0) customOrder.push(s.id);
    });
    nextCustoms.sort(function (a, b) {
      return customOrder.indexOf(a.id) - customOrder.indexOf(b.id);
    });

    scenes = BUILTIN_SCENES.map(cloneScene).concat(nextCustoms);

    var wanted = typeof data.activeSceneId === 'string' ? data.activeSceneId : 'gaming-cam';
    activeSceneId = findScene(wanted) ? wanted : 'gaming-cam';

    if (data.layers && typeof data.layers === 'object') {
      Object.keys(layers).forEach(function (key) {
        if (typeof data.layers[key] === 'boolean') layers[key] = data.layers[key];
      });
    }
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
    var stub = scene ? stubPreset(scene.id) : null;
    var webcamPip = scene
      ? scene.id === 'gaming-cam' || scene.id === 'desk-only' || isCustomSceneId(scene.id)
      : false;
    return {
      sceneId: scene ? scene.id : activeSceneId,
      scene: scene ? cloneScene(scene) : null,
      name: scene ? scene.name : '',
      card: stub ? { id: stub.id, title: stub.title, subtitle: stub.subtitle } : null,
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
      customScenes: customScenes().map(function (s) {
        return { id: s.id, name: s.name };
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
    } else if (sceneId === 'desk-only' || isCustomSceneId(sceneId)) {
      layers.game = false;
      layers.cam = true;
    } else if (isStubSceneId(sceneId)) {
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

  function ensureContextMenu() {
    if (contextMenu) return contextMenu;
    contextMenu = document.createElement('ul');
    contextMenu.className = 'scenes-context-menu';
    contextMenu.hidden = true;
    contextMenu.setAttribute('role', 'menu');
    document.body.appendChild(contextMenu);
    document.addEventListener('click', function (event) {
      if (!contextMenu || contextMenu.hidden) return;
      if (contextMenu.contains(event.target)) return;
      closeContextMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeContextMenu();
    });
    return contextMenu;
  }

  function closeContextMenu() {
    if (!contextMenu) return;
    contextMenu.hidden = true;
    contextMenu.innerHTML = '';
  }

  function openContextMenu(sceneId, anchor) {
    var scene = findScene(sceneId);
    if (!scene) return;
    ensureContextMenu();
    contextMenu.innerHTML = '';

    function addItem(label, onSelect, disabled) {
      var li = document.createElement('li');
      li.setAttribute('role', 'none');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.textContent = label;
      btn.disabled = !!disabled;
      btn.addEventListener('click', function () {
        closeContextMenu();
        onSelect();
      });
      li.appendChild(btn);
      contextMenu.appendChild(li);
    }

    if (isCustomSceneId(sceneId)) {
      addItem('Rename', function () {
        var input = scenesList.querySelector(
          'button[data-scene="' + sceneId + '"] .studio-scene-name-input',
        );
        if (input) {
          input.focus();
          input.select();
        }
      });
      var customs = customScenes();
      var idx = customs.findIndex(function (s) { return s.id === sceneId; });
      addItem('Move up', function () { reorderCustom(sceneId, -1); }, idx <= 0);
      addItem('Move down', function () { reorderCustom(sceneId, 1); }, idx < 0 || idx >= customs.length - 1);
      addItem(scenes.length <= 1 ? "Can't delete the last scene" : 'Delete scene', function () {
        deleteScene(sceneId);
      }, scenes.length <= 1);
    } else if (scene.menuStatic) {
      addItem('No options for Gameplay', function () {}, true);
    } else {
      addItem('Scene options (desktop app)', function () {}, true);
      addItem('Cancel', function () {});
    }

    var rect = anchor.getBoundingClientRect();
    contextMenu.hidden = false;
    var menuWidth = contextMenu.offsetWidth || 176;
    var left = Math.min(global.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth));
    var top = Math.min(global.innerHeight - contextMenu.offsetHeight - 8, rect.bottom + 4);
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
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

  function syncAddSceneButton() {
    var atMax = customCount() >= MAX_CUSTOM_SCENES;
    var title = atMax ? 'Maximum of ' + MAX_CUSTOM_SCENES + ' custom scenes' : 'Add scene';
    var btn = document.getElementById('btn-add-scene-alt');
    if (btn) {
      btn.disabled = atMax;
      btn.title = title;
    }
  }

  function builtinButtonId(sceneId) {
    if (sceneId === 'gaming-cam') return 'scene-gameplay';
    if (sceneId === 'starting-soon') return 'scene-starting';
    if (sceneId === 'desk-only') return 'scene-chatting';
    if (sceneId === 'intermission') return 'scene-intermission';
    if (sceneId === 'ending') return 'scene-ending';
    return '';
  }

  function renderSceneList() {
    if (!scenesList) return;
    scenesList.innerHTML = '';

    scenes.forEach(function (scene) {
      var li = document.createElement('li');
      if (isCustomSceneId(scene.id)) li.dataset.customSceneRow = '1';

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
      leading.textContent = scene.icon || '▶️';

      var menu = document.createElement('span');
      menu.textContent = '⋯';
      if (scene.menuStatic) {
        menu.className = 'studio-list-menu studio-list-menu--static';
        menu.setAttribute('aria-hidden', 'true');
        menu.title = 'No image for Gameplay';
      } else {
        menu.setAttribute('role', 'button');
        menu.tabIndex = 0;
        menu.className = 'studio-list-menu';
        menu.dataset.sceneMenu = scene.id;
        menu.setAttribute('aria-label', 'Scene options');
        menu.title = 'Scene options';
      }

      if (isCustomSceneId(scene.id)) {
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'studio-scene-name-input studio-list-text';
        nameInput.value = scene.name;
        nameInput.spellcheck = false;
        nameInput.setAttribute('aria-label', 'Scene name');
        nameInput.title = 'Double-click to rename';
        nameInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        nameInput.addEventListener('dblclick', function (event) {
          event.stopPropagation();
          nameInput.select();
        });
        nameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            nameInput.blur();
          }
        });
        nameInput.addEventListener('blur', function () {
          renameCustomScene(scene.id, nameInput.value);
        });
        btn.append(leading, nameInput, menu);
      } else {
        var text = document.createElement('span');
        text.className = 'studio-list-text';
        text.textContent = scene.name;
        btn.append(leading, text, menu);
      }

      btn.addEventListener('click', function (event) {
        if (event.target.closest && event.target.closest('[data-scene-menu]')) return;
        selectScene(scene.id);
      });

      li.appendChild(btn);
      scenesList.appendChild(li);
    });

    var addSceneRow = document.createElement('li');
    addSceneRow.id = 'studio-add-scene-row';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'studio-list-item studio-list-add';
    addBtn.id = 'btn-add-scene-alt';
    addBtn.innerHTML =
      '<span class="studio-list-leading scene-icon" aria-hidden="true">+</span>' +
      '<span class="studio-list-text">Add Scene</span>';
    addBtn.addEventListener('click', function () {
      addCustomScene();
    });
    addSceneRow.appendChild(addBtn);
    scenesList.appendChild(addSceneRow);
    syncAddSceneButton();
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

  function syncSourceRows() {
    SOURCE_KINDS.forEach(function (kind) {
      var el = document.getElementById(SOURCE_META[kind].id);
      if (!el) return;
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

  function renderSourcePicker(kind) {
    var picker = document.getElementById(SOURCE_META[kind].picker);
    if (!picker) return;
    picker.innerHTML = '';

    if (kind === 'game' || kind === 'webcam' || kind === 'mic') {
      appendPickerStatus(
        picker,
        'Capture device lists are not available in this browser mock. Toggle the row to set visibility.',
      );
      appendPickerButton(picker, 'Mark as connected (mock)', !!sourceActive[kind], function () {
        sourceActive[kind] = !sourceActive[kind];
        if (sourceActive[kind]) {
          if (kind === 'game') layers.game = true;
          if (kind === 'webcam') layers.cam = true;
          if (kind === 'mic') layers.mic = true;
        }
        syncSourcePickerVisibility();
        emitAll();
      });
      return;
    }

    if (kind === 'browser') {
      appendPickerSection(picker, 'Layout presets');
      appendPickerButton(picker, 'Follow scene layout', !layers.overlay && !layers.browser, function () {
        layers.overlay = false;
        layers.browser = false;
        sourceActive.browser = false;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerButton(picker, 'Overlay on (mock)', !!(layers.overlay || layers.browser), function () {
        layers.overlay = true;
        sourceActive.browser = true;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerStatus(picker, 'Native search-tab overlay capture is desktop-only.');
      return;
    }

    if (kind === 'chat') {
      appendPickerButton(picker, 'Chat off', !layers.chat, function () {
        layers.chat = false;
        sourceActive.chat = false;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerButton(picker, 'Placeholder chat', layers.chat, function () {
        layers.chat = true;
        sourceActive.chat = true;
        syncSourcePickerVisibility();
        emitAll();
      });
      return;
    }

    if (kind === 'notifications') {
      appendPickerButton(picker, 'Notifications off', !layers.notifications, function () {
        layers.notifications = false;
        sourceActive.notifications = false;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerButton(picker, 'Placeholder overlay', layers.notifications, function () {
        layers.notifications = true;
        sourceActive.notifications = true;
        syncSourcePickerVisibility();
        emitAll();
      });
    }
  }

  function wireSourceToggle(kind, btn) {
    if (btn.dataset.scenesWired === '1') return;
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
      var li = document.createElement('li');
      li.className = 'studio-source-group';

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
      menu.setAttribute('role', 'button');
      menu.tabIndex = 0;
      menu.className = 'studio-list-menu';
      menu.dataset.sourceMenu = kind;
      menu.setAttribute('aria-label', meta.menuLabel);
      menu.title = meta.menuLabel;
      menu.textContent = '⋯';

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
        if (status) status.textContent = 'Source lists refreshed (mock)';
        setTimeout(function () {
          if (status) status.textContent = 'All systems nominal';
        }, 1600);
      });
      refresh.dataset.scenesWired = '1';
    }

    syncSourcePickerVisibility();
  }

  function toggleSourcePicker(kind) {
    expandedSourceKind = expandedSourceKind === kind ? null : kind;
    syncSourcePickerVisibility();
  }

  function toggleLayerForSourceKind(kind) {
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

  function renameCustomScene(sceneId, rawName) {
    if (!isCustomSceneId(sceneId)) return;
    var scene = findScene(sceneId);
    if (!scene) return;
    var trimmed = String(rawName || '').trim().slice(0, 80) || defaultCustomSceneName(sceneId);
    if (scene.name === trimmed) return;
    scene.name = trimmed;
    renderSceneList();
    emitAll();
  }

  function addCustomScene() {
    if (customCount() >= MAX_CUSTOM_SCENES) return;
    var id = nextCustomSceneId(customScenes());
    if (!id) return;
    scenes.push({ id: id, name: defaultCustomSceneName(id), icon: '▶️', builtin: false });
    customOrder.push(id);
    renderSceneList();
    selectScene(id);
    var input = scenesList.querySelector(
      'button[data-scene="' + id + '"] .studio-scene-name-input',
    );
    if (input) {
      input.focus();
      input.select();
    }
  }

  function deleteScene(sceneId) {
    if (scenes.length <= 1) return;
    if (!isCustomSceneId(sceneId)) return;
    var index = scenes.findIndex(function (s) { return s.id === sceneId; });
    if (index < 0) return;
    var wasActive = activeSceneId === sceneId;
    scenes.splice(index, 1);
    customOrder = customOrder.filter(function (id) { return id !== sceneId; });
    if (wasActive) {
      var neighbor = scenes[Math.min(index, scenes.length - 1)] || scenes[0];
      activeSceneId = neighbor.id;
      applySceneLayerDefaults(neighbor.id);
    }
    renderSceneList();
    highlightSceneSelection(activeSceneId);
    syncSourceRows();
    emitAll();
  }

  function reorderCustom(sceneId, delta) {
    var customs = customScenes();
    var idx = customs.findIndex(function (s) { return s.id === sceneId; });
    var next = idx + delta;
    if (idx < 0 || next < 0 || next >= customs.length) return;
    var order = customs.map(function (s) { return s.id; });
    var tmp = order[idx];
    order[idx] = order[next];
    order[next] = tmp;
    customOrder = order;
    var builtins = BUILTIN_SCENES.map(cloneScene);
    var reordered = order
      .map(function (id) { return findScene(id); })
      .filter(Boolean)
      .map(function (s) {
        return { id: s.id, name: s.name, icon: s.icon || '▶️', builtin: false };
      });
    scenes = builtins.concat(reordered);
    renderSceneList();
    emitAll();
  }

  function wireSceneMenus() {
    if (!scenesList || scenesList.dataset.menuWired === '1') return;
    scenesList.addEventListener(
      'click',
      function (event) {
        var target = event.target.closest && event.target.closest('[data-scene-menu]');
        if (!target || target.classList.contains('studio-list-menu--static')) return;
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(target.dataset.sceneMenu, target);
      },
      true,
    );
    scenesList.addEventListener(
      'keydown',
      function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var target = event.target.closest && event.target.closest('[data-scene-menu]');
        if (!target || target.classList.contains('studio-list-menu--static')) return;
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(target.dataset.sceneMenu, target);
      },
      true,
    );
    scenesList.dataset.menuWired = '1';
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
      addScene: addCustomScene,
      deleteScene: deleteScene,
      toggleSource: toggleLayerForSourceKind,
      refresh: function () {
        renderSceneList();
        renderSourcesList();
        syncSourceRows();
      },
      root: function () { return root; },
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
    wireSceneMenus();
    highlightSceneSelection(activeSceneId);
    syncSourceRows();
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
