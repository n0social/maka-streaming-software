/**
 * Browser program preview — ports Electron studio PROGRAM stage.
 * Screen via getDisplayMedia, webcam via getUserMedia, 16:9 contained frame.
 *
 * Click contract (with scenes.js — do not double-bind):
 *   - Capture ONLY via explicit controls: [data-preview="btn-screen"] /
 *     [data-preview="btn-webcam"] (and legacy #btn-screen / #btn-webcam if present).
 *   - Do NOT bind #studio-source-game / #studio-source-webcam (or any .studio-source-toggle)
 *     for capture — those rows are scenes layer visibility toggles only.
 *   - Scene cards / maka:scene-change update program chrome (name, stub card, webcam PIP);
 *     they must not start getDisplayMedia / getUserMedia.
 *
 * From shell:
 *   import { initPreview } from './preview.js'
 *   const preview = initPreview(document.getElementById('studio-preview'))
 *
 * Public API: window.MakaStreamPreview (canonical); window.MakaPreview is an alias; host._makaPreview is the same instance.
 */
const EMPTY_COPY = 'Share the GeForce Now tab or window to preview cloud gameplay';
const SHARE_BTN_LABEL = 'Share GeForce Now tab / window';
const SHARE_BTN_ACTIVE = 'Stop sharing';
const WEBCAM_OFFLINE = 'video is offline';
const DEFAULT_SCENE = 'Gameplay';
const CAPTURE_HINT =
  'In the browser picker, choose the GeForce Now tab or window — not an unrelated display unless you want the whole monitor.';

function ensureStylesheet() {
  const href = new URL('../css/preview-stage.css', import.meta.url).pathname;
  if (document.querySelector('link[data-preview-stage-css]')) return;
  const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((l) =>
    String(l.getAttribute('href') || '').includes('preview-stage.css'),
  );
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.previewStageCss = '1';
  document.head.appendChild(link);
}

function stopTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch (_) {
      /* ignore */
    }
  });
}

function $(root, sel) {
  return root.querySelector(sel);
}

/**
 * Ensure PROGRAM chrome exists inside root (matches exe labels).
 * Reuses shell markup when present; otherwise builds a contained stage.
 */
function ensureMarkup(root) {
  root.classList.add('preview-stage-host');
  if (!root.id) root.id = 'studio-preview';

  let program = $(root, '#program-video, [data-preview="program"], .preview-stage__program');
  if (program) {
    // Shell already shipped exe-shaped chrome — add scene-name overlay + controls if missing.
    if (!$(root, '.preview-stage__scene-name, [data-preview="scene-name"]')) {
      const name = document.createElement('div');
      name.className = 'preview-stage__scene-name';
      name.dataset.preview = 'scene-name';
      name.hidden = true;
      const label = $(root, '.program-label');
      if (label && label.parentElement) label.parentElement.insertBefore(name, label.nextSibling);
      else root.appendChild(name);
    }
    if (!$(root, '.preview-stage__controls, [data-preview="controls"]')) {
      const controls = document.createElement('div');
      controls.className = 'preview-stage__controls';
      controls.dataset.preview = 'controls';
      controls.innerHTML =
        '<button type="button" class="preview-stage__btn" data-preview="btn-screen">' +
        SHARE_BTN_LABEL +
        '</button>' +
        '<button type="button" class="preview-stage__btn" data-preview="btn-webcam">Add webcam</button>';
      root.appendChild(controls);
    } else {
      const screenBtn = $(root, '[data-preview="btn-screen"]');
      if (screenBtn && /share screen/i.test(screenBtn.textContent || '')) {
        screenBtn.textContent = SHARE_BTN_LABEL;
      }
    }
    if (!$(root, '.preview-capture-hint, [data-preview="capture-hint"], #preview-capture-hint')) {
      const hint = document.createElement('p');
      hint.className = 'preview-capture-hint';
      hint.dataset.preview = 'capture-hint';
      hint.id = 'preview-capture-hint';
      hint.textContent = CAPTURE_HINT;
      const controlsEl = $(root, '.preview-stage__controls, [data-preview="controls"]');
      if (controlsEl && controlsEl.parentElement) {
        controlsEl.parentElement.insertBefore(hint, controlsEl.nextSibling);
      } else {
        root.appendChild(hint);
      }
    }
    const emptyEl = $(root, '#program-empty, [data-preview="empty"], .program-empty');
    if (emptyEl && /select a display or window/i.test(emptyEl.textContent || '')) {
      emptyEl.textContent = EMPTY_COPY;
    }
    // Wrap content in .preview-stage for 16:9 containment when shell used a bare host.
    if (!$(root, '.preview-stage') && root.id === 'studio-preview') {
      const stage = document.createElement('div');
      stage.className = 'preview-stage';
      stage.dataset.chrome = '1';
      while (root.firstChild) stage.appendChild(root.firstChild);
      root.appendChild(stage);
    }
    return;
  }

  root.innerHTML = [
    '<div class="preview-stage" data-chrome="1">',
    '  <div class="program-label preview-stage__label">',
    '    Program',
    '    <span class="program-mode preview-stage__mode">• Live Output</span>',
    '  </div>',
    '  <div class="preview-stage__scene-name" data-preview="scene-name" hidden></div>',
    '  <video id="program-video" class="preview-stage__program" data-preview="program" autoplay muted playsinline hidden></video>',
    '  <div class="program-cam preview-stage__cam" id="program-cam" data-preview="cam" hidden>',
    '    <video id="program-cam-video" class="preview-stage__cam-video" data-preview="cam-video" autoplay muted playsinline hidden></video>',
    '    <p class="program-cam-offline preview-stage__cam-offline" id="program-cam-offline" data-preview="cam-offline">' +
      WEBCAM_OFFLINE +
      '</p>',
    '    <span class="program-cam-tag preview-stage__cam-tag">Webcam</span>',
    '  </div>',
    '  <div class="program-scene-card preview-stage__scene-card" id="program-scene-card" data-preview="scene-card" hidden>',
    '    <div class="program-scene-card-inner preview-stage__scene-card-inner">',
    '      <span class="program-scene-card-mark preview-stage__scene-card-mark" aria-hidden="true">M</span>',
    '      <p class="program-scene-card-title preview-stage__scene-card-title" id="program-scene-card-title" data-preview="scene-title">Starting Soon</p>',
    '      <p class="program-scene-card-subtitle preview-stage__scene-card-subtitle" id="program-scene-card-subtitle" data-preview="scene-subtitle">Hang tight — we’ll be live in a moment</p>',
    '    </div>',
    '  </div>',
    '  <p class="program-empty preview-stage__empty" id="program-empty" data-preview="empty">' +
      EMPTY_COPY +
      '</p>',
    '  <div class="preview-stage__controls" data-preview="controls">',
    '    <button type="button" class="preview-stage__btn" data-preview="btn-screen">' +
      SHARE_BTN_LABEL +
      '</button>',
    '    <button type="button" class="preview-stage__btn" data-preview="btn-webcam">Add webcam</button>',
    '  </div>',
    '  <p class="preview-capture-hint" data-preview="capture-hint">' + CAPTURE_HINT + '</p>',
    '</div>',
  ].join('\n');
}

function collectEls(root) {
  const scope = $(root, '.preview-stage') || root;
  return {
    stage: $(root, '.preview-stage') || root,
    sceneName: $(root, '[data-preview="scene-name"], .preview-stage__scene-name'),
    program: $(root, '#program-video, [data-preview="program"], .preview-stage__program'),
    cam: $(root, '#program-cam, [data-preview="cam"], .preview-stage__cam, .program-cam'),
    camVideo: $(root, '#program-cam-video, [data-preview="cam-video"], .preview-stage__cam-video'),
    camOffline: $(root, '#program-cam-offline, [data-preview="cam-offline"], .program-cam-offline'),
    sceneCard: $(root, '#program-scene-card, [data-preview="scene-card"], .program-scene-card'),
    sceneTitle: $(root, '#program-scene-card-title, [data-preview="scene-title"]'),
    sceneSubtitle: $(root, '#program-scene-card-subtitle, [data-preview="scene-subtitle"]'),
    empty: $(root, '#program-empty, [data-preview="empty"], .program-empty'),
    btnScreen: $(root, '[data-preview="btn-screen"]'),
    btnWebcam: $(root, '[data-preview="btn-webcam"]'),
    captureHint: $(root, '[data-preview="capture-hint"], #preview-capture-hint, .preview-capture-hint'),
    scope,
  };
}

/**
 * Mount / wire a contained 16:9 PROGRAM preview into `root`.
 * @param {HTMLElement | null | undefined} root
 * @returns {object | null}
 */
export function initPreview(root) {
  if (!root || !(root instanceof HTMLElement)) {
    console.warn('[preview] initPreview requires an HTMLElement root');
    return null;
  }

  if (root.dataset.previewReady === '1' && root._makaPreview) {
    return root._makaPreview;
  }

  ensureStylesheet();
  ensureMarkup(root);
  const els = collectEls(root);

  if (!els.program || !els.empty) {
    console.warn('[preview] missing program video or empty placeholder');
    return null;
  }

  /** @type {MediaStream | null} */
  let screenStream = null;
  /** @type {MediaStream | null} */
  let webcamStream = null;
  /** Show PIP chrome even without a live track (matches app mock). */
  let webcamPipDesired = true;
  let destroyed = false;

  function syncUi() {
    if (destroyed) return;
    const hasScreen = Boolean(
      screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live'),
    );
    const hasCam = Boolean(
      webcamStream && webcamStream.getVideoTracks().some((t) => t.readyState === 'live'),
    );
    const hasMain = hasScreen || hasCam;

    if (els.btnScreen) {
      els.btnScreen.textContent = hasScreen ? SHARE_BTN_ACTIVE : SHARE_BTN_LABEL;
      els.btnScreen.title = hasScreen
        ? 'Stop sharing the GeForce Now tab or window'
        : 'Share the GeForce Now tab or window (getDisplayMedia)';
    }
    if (els.captureHint) {
      els.captureHint.hidden = hasScreen;
      if (!els.captureHint.textContent.trim()) els.captureHint.textContent = CAPTURE_HINT;
    }

    if (hasScreen) {
      if (els.program.srcObject !== screenStream) els.program.srcObject = screenStream;
      els.program.hidden = false;
      void els.program.play().catch(() => undefined);
    } else if (hasCam) {
      if (els.program.srcObject !== webcamStream) els.program.srcObject = webcamStream;
      els.program.hidden = false;
      void els.program.play().catch(() => undefined);
    } else {
      els.program.srcObject = null;
      els.program.hidden = true;
    }

    if (els.cam) {
      if (webcamPipDesired) {
        els.cam.hidden = false;
        if (hasCam && hasScreen && els.camVideo) {
          if (els.camVideo.srcObject !== webcamStream) els.camVideo.srcObject = webcamStream;
          els.camVideo.hidden = false;
          if (els.camOffline) els.camOffline.hidden = true;
          void els.camVideo.play().catch(() => undefined);
        } else if (els.camVideo) {
          els.camVideo.srcObject = null;
          els.camVideo.hidden = true;
          if (els.camOffline) {
            els.camOffline.hidden = false;
            els.camOffline.textContent =
              hasCam && !hasScreen ? 'Webcam · program' : WEBCAM_OFFLINE;
          }
        }
      } else {
        els.cam.hidden = true;
        if (els.camVideo) els.camVideo.srcObject = null;
      }
    }

    const cardVisible = Boolean(els.sceneCard && !els.sceneCard.hidden);
    els.empty.hidden = hasMain || cardVisible;
    if (!hasMain && !cardVisible) {
      els.empty.textContent = EMPTY_COPY;
    }

    if (els.btnScreen) {
      els.btnScreen.dataset.on = hasScreen ? '1' : '0';
      // Keep GeForce Now share copy (do not overwrite with generic "Share screen").
      els.btnScreen.textContent = hasScreen ? SHARE_BTN_ACTIVE : SHARE_BTN_LABEL;
    }
    if (els.btnWebcam) {
      els.btnWebcam.dataset.on = hasCam ? '1' : '0';
      els.btnWebcam.textContent = hasCam ? 'Stop webcam' : 'Add webcam';
    }

    const detail = {
      hasScreen,
      hasWebcam: hasCam,
      hasCapture: hasScreen || hasCam,
      sceneName: els.sceneName && !els.sceneName.hidden ? els.sceneName.textContent || '' : '',
    };
    root.dispatchEvent(new CustomEvent('maka:preview-change', { bubbles: true, detail }));
    // Mirror on window so live.js listeners fire even if a parent stops propagation.
    window.dispatchEvent(new CustomEvent('maka:preview-change', { detail }));
  }

  function setSceneName(name) {
    if (!els.sceneName) return;
    const label = String(name || '').trim();
    if (!label) {
      els.sceneName.hidden = true;
      els.sceneName.textContent = '';
      return;
    }
    els.sceneName.textContent = label;
    els.sceneName.hidden = false;
  }

  function setSceneCard(card) {
    if (!els.sceneCard) return;
    if (!card) {
      els.sceneCard.hidden = true;
      els.sceneCard.removeAttribute('data-scene');
      syncUi();
      return;
    }
    const id = String(card.id || card.scene || '').toLowerCase();
    if (els.sceneTitle) els.sceneTitle.textContent = card.title || 'Starting Soon';
    if (els.sceneSubtitle) {
      els.sceneSubtitle.textContent =
        card.subtitle || 'Hang tight — we’ll be live in a moment';
    }
    if (id) els.sceneCard.setAttribute('data-scene', id);
    else els.sceneCard.removeAttribute('data-scene');
    els.sceneCard.hidden = false;
    syncUi();
  }

  function setWebcamPipVisible(show) {
    webcamPipDesired = Boolean(show);
    syncUi();
  }

  function setChromeVisible(show) {
    if (els.stage && els.stage.dataset) els.stage.dataset.chrome = show ? '1' : '0';
  }

  async function startScreen() {
    if (destroyed) return null;
    stopScreen();
    try {
      // Prefer browser tab / window for GeForce Now; fall back if the UA rejects constraints.
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 60 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
          systemAudio: 'include',
        });
      } catch (_constrained) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
          },
          audio: true,
        });
      }
      screenStream = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (screenStream === stream) {
            screenStream = null;
            syncUi();
          }
        });
      }
      syncUi();
      return stream;
    } catch (err) {
      console.warn('[preview] getDisplayMedia failed', err);
      syncUi();
      return null;
    }
  }

  async function startWebcam() {
    if (destroyed) return null;
    stopWebcam();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      webcamStream = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (webcamStream === stream) {
            webcamStream = null;
            syncUi();
          }
        });
      }
      webcamPipDesired = true;
      syncUi();
      return stream;
    } catch (err) {
      console.warn('[preview] getUserMedia failed', err);
      syncUi();
      return null;
    }
  }

  function stopScreen() {
    stopTracks(screenStream);
    screenStream = null;
    if (els.program.srcObject) els.program.srcObject = null;
    syncUi();
  }

  function stopWebcam() {
    stopTracks(webcamStream);
    webcamStream = null;
    if (els.camVideo && els.camVideo.srcObject) els.camVideo.srcObject = null;
    syncUi();
  }

  /**
   * Attach an existing MediaStream as the gameplay / screen bed (tests, helpers).
   * Does not stop tracks on replace when opts.keepPreviousTracks is true.
   */
  function setScreenStream(stream, opts = {}) {
    if (destroyed) return null;
    if (!opts.keepPreviousTracks) stopTracks(screenStream);
    screenStream = stream || null;
    if (screenStream) {
      const track = screenStream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (screenStream === stream) {
            screenStream = null;
            syncUi();
          }
        });
      }
    }
    syncUi();
    return screenStream;
  }

  function setWebcamStream(stream, opts = {}) {
    if (destroyed) return null;
    if (!opts.keepPreviousTracks) stopTracks(webcamStream);
    webcamStream = stream || null;
    if (webcamStream) webcamPipDesired = true;
    if (webcamStream) {
      const track = webcamStream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (webcamStream === stream) {
            webcamStream = null;
            syncUi();
          }
        });
      }
    }
    syncUi();
    return webcamStream;
  }

  function getStreams() {
    return { screen: screenStream, webcam: webcamStream };
  }

  function captureFrameCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawContain = (video, dx, dy, dw, dh) => {
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(dw / vw, dh / vh);
      const tw = vw * scale;
      const th = vh * scale;
      ctx.drawImage(video, dx + (dw - tw) / 2, dy + (dh - th) / 2, tw, th);
    };

    const drawCover = (video, dx, dy, dw, dh) => {
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(dw / vw, dh / vh);
      const tw = vw * scale;
      const th = vh * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, dw, dh);
      ctx.clip();
      ctx.drawImage(video, dx + (dw - tw) / 2, dy + (dh - th) / 2, tw, th);
      ctx.restore();
    };

    if (!els.program.hidden) drawContain(els.program, 0, 0, canvas.width, canvas.height);

    if (els.cam && !els.cam.hidden && els.camVideo && !els.camVideo.hidden) {
      const pipW = Math.round(canvas.width * 0.22);
      const pipH = Math.round(pipW * (9 / 16));
      const x = canvas.width - pipW - Math.round(canvas.width * 0.045);
      const y = canvas.height - pipH - Math.round(canvas.height * 0.055);
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, pipW + 3, pipH + 3);
      drawCover(els.camVideo, x, y, pipW, pipH);
    }

    return canvas;
  }

  function onScreenClick() {
    if (screenStream) stopScreen();
    else void startScreen();
  }

  function onWebcamClick() {
    if (webcamStream) stopWebcam();
    else void startWebcam();
  }

  function onSceneEvent(ev) {
    const detail = ev && ev.detail;
    if (!detail) return;
    if (typeof detail.name === 'string') setSceneName(detail.name);
    if (detail.card !== undefined) setSceneCard(detail.card);
    if (typeof detail.webcamPip === 'boolean') setWebcamPipVisible(detail.webcamPip);
  }

  if (els.btnScreen) els.btnScreen.addEventListener('click', onScreenClick);
  if (els.btnWebcam) els.btnWebcam.addEventListener('click', onWebcamClick);
  root.addEventListener('maka:scene-change', onSceneEvent);
  window.addEventListener('maka:scene-change', onSceneEvent);

  // Legacy shell IDs only — never #studio-source-* (scenes owns those for layer toggle).
  const externalScreen = document.getElementById('btn-screen');
  const externalWebcam = document.getElementById('btn-webcam');
  if (externalScreen) externalScreen.addEventListener('click', onScreenClick);
  if (externalWebcam) externalWebcam.addEventListener('click', onWebcamClick);

  // Scene list → scene name overlay
  document.querySelectorAll('[data-scene]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.querySelector('.studio-list-text');
      const name = (text && text.textContent) || btn.getAttribute('data-scene') || '';
      setSceneName(name);
      const sceneId = btn.getAttribute('data-scene') || '';
      if (sceneId === 'starting-soon' || sceneId === 'intermission' || sceneId === 'ending') {
        setSceneCard({
          id: sceneId === 'starting-soon' ? 'starting' : sceneId,
          title: name,
          subtitle:
            sceneId === 'ending'
              ? 'Thanks for watching — see you next time'
              : 'Hang tight — we’ll be live in a moment',
        });
      } else {
        setSceneCard(null);
      }
    });
  });

  setSceneName(root.dataset.sceneName || DEFAULT_SCENE);
  // Default: show webcam PIP mock like the exe (offline until capture).
  if (els.cam) els.cam.hidden = false;
  if (els.camOffline) {
    els.camOffline.hidden = false;
    els.camOffline.textContent = WEBCAM_OFFLINE;
  }
  syncUi();

  const api = {
    root,
    setSceneName,
    setSceneCard,
    setWebcamPipVisible,
    setChromeVisible,
    startScreen,
    startWebcam,
    stopScreen,
    stopWebcam,
    setScreenStream,
    setWebcamStream,
    getStreams,
    captureFrameCanvas,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (els.btnScreen) els.btnScreen.removeEventListener('click', onScreenClick);
      if (els.btnWebcam) els.btnWebcam.removeEventListener('click', onWebcamClick);
      if (externalScreen) externalScreen.removeEventListener('click', onScreenClick);
      if (externalWebcam) externalWebcam.removeEventListener('click', onWebcamClick);
      root.removeEventListener('maka:scene-change', onSceneEvent);
      window.removeEventListener('maka:scene-change', onSceneEvent);
      stopScreen();
      stopWebcam();
      delete root.dataset.previewReady;
      delete root._makaPreview;
      if (typeof globalThis !== 'undefined') {
        if (globalThis.MakaStreamPreview === api) delete globalThis.MakaStreamPreview;
        if (globalThis.MakaPreview === api) delete globalThis.MakaPreview;
      }
    },
  };

  root.dataset.previewReady = '1';
  root._makaPreview = api;
  if (typeof globalThis !== 'undefined') {
    // Canonical public name; MakaPreview kept as a back-compat alias (same object).
    globalThis.MakaStreamPreview = api;
    globalThis.MakaPreview = api;
  }
  return api;
}

if (typeof globalThis !== 'undefined') {
  globalThis.initPreview = initPreview;
}
