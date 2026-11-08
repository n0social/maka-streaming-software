/**
 * Browser program preview — ports Electron studio PROGRAM stage.
 * Screen via getDisplayMedia, webcam via getUserMedia, 16:9 contained frame.
 *
 * Click contract (with scenes.js — do not double-bind):
 *   - Capture via the Sources ⋯ pickers calling startScreen / startWebcam on this API
 *     (and legacy #btn-screen / #btn-webcam if present). Stage Share / Add webcam
 *     buttons are removed — Sources is the only capture entry point.
 *   - Do NOT bind #studio-source-game / #studio-source-webcam (or any .studio-source-toggle)
 *     for capture — those rows are scenes layer visibility toggles only.
 *   - Scene cards / maka:scene-change update program chrome (stub card, webcam PIP);
 *     they must not start getDisplayMedia / getUserMedia. Scene name is not overlaid.
 *
 * From shell:
 *   import { initPreview } from './preview.js'
 *   const preview = initPreview(document.getElementById('studio-preview'))
 *
 * Public API: window.MakaStreamPreview (canonical); window.MakaPreview is an alias; host._makaPreview is the same instance.
 */
const EMPTY_COPY = '';
const WEBCAM_OFFLINE = 'video is offline';

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

function getAudioApi() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.MakaStreamAudio || null;
}

/**
 * Route getDisplayMedia audio to mixer channels (kept separate):
 *   browser tab → game; monitor / window / system loopback → desktop.
 * @param {MediaStream | null} stream
 * @param {string} [requestedSurface]
 */
function routeDisplayAudioToMixer(stream, requestedSurface) {
  const audio = getAudioApi();
  if (!audio || typeof audio.setStream !== 'function') return;

  const clear = (id) => {
    if (typeof audio.clearStream === 'function') audio.clearStream(id);
    else audio.setStream(id, null);
  };

  clear('desktop');
  clear('game');

  if (!stream || typeof stream.getAudioTracks !== 'function') return;
  const audioTracks = stream.getAudioTracks().filter((t) => t && t.readyState !== 'ended');
  if (!audioTracks.length) return;

  let surface = typeof requestedSurface === 'string' ? requestedSurface : '';
  try {
    const video = stream.getVideoTracks()[0];
    const settings = video && typeof video.getSettings === 'function' ? video.getSettings() : null;
    if (settings && typeof settings.displaySurface === 'string' && settings.displaySurface) {
      surface = settings.displaySurface;
    }
  } catch (_) {
    /* getSettings optional */
  }

  const channel = surface === 'browser' ? 'game' : 'desktop';
  const audioOnly = new MediaStream(audioTracks);
  audio.setStream(channel, audioOnly);
}

function clearDisplayAudioFromMixer() {
  const audio = getAudioApi();
  if (!audio) return;
  if (typeof audio.clearStream === 'function') {
    audio.clearStream('desktop');
    audio.clearStream('game');
  } else if (typeof audio.setStream === 'function') {
    audio.setStream('desktop', null);
    audio.setStream('game', null);
  }
}

function $(root, sel) {
  return root.querySelector(sel);
}

function $all(root, sel) {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Ensure PROGRAM chrome exists inside root (matches exe labels).
 * Reuses shell markup when present; otherwise builds a contained stage.
 */
function ensureMarkup(root) {
  root.classList.add('preview-stage-host');
  if (!root.id) root.id = 'studio-preview';

  // Declutter: Sources pickers own capture — strip stage Share / webcam / bottom hint.
  $all(root, '.preview-stage__controls, [data-preview="controls"]').forEach((el) => el.remove());
  $all(
    root,
    '.preview-capture-hint, [data-preview="capture-hint"], #preview-capture-hint',
  ).forEach((el) => el.remove());
  // Scene name pill removed from program preview.
  $all(root, '.preview-stage__scene-name, [data-preview="scene-name"]').forEach((el) => el.remove());

  let program = $(root, '#program-video, [data-preview="program"], .preview-stage__program');
  if (program) {
    const emptyEl = $(root, '#program-empty, [data-preview="empty"], .program-empty');
    if (emptyEl && /select a display or window/i.test(emptyEl.textContent || '')) {
      emptyEl.textContent = EMPTY_COPY;
    }
    const sceneInner = $(root, '.program-scene-card-inner, .preview-stage__scene-card-inner');
    if (sceneInner && !$(sceneInner, '.program-scene-card-brand, .preview-stage__scene-card-brand')) {
      const brand = document.createElement('span');
      brand.className = 'program-scene-card-brand preview-stage__scene-card-brand';
      brand.setAttribute('aria-hidden', 'true');
      brand.textContent = 'MAKA';
      sceneInner.insertBefore(brand, sceneInner.firstChild);
    }
    const cam = $(root, '#program-cam, .program-cam, [data-preview="cam"]');
    if (cam) {
      cam.classList.add('preview-stage__cam');
      const camVideo = $(cam, '#program-cam-video, video');
      if (camVideo) camVideo.classList.add('preview-stage__cam-video');
      const camOffline = $(cam, '#program-cam-offline, .program-cam-offline');
      if (camOffline) camOffline.classList.add('preview-stage__cam-offline');
      const camTag = $(cam, '.program-cam-tag');
      if (camTag) camTag.classList.add('preview-stage__cam-tag');
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
    '      <span class="program-scene-card-brand preview-stage__scene-card-brand" aria-hidden="true">MAKA</span>',
    '      <span class="program-scene-card-mark preview-stage__scene-card-mark" aria-hidden="true">M</span>',
    '      <p class="program-scene-card-title preview-stage__scene-card-title" id="program-scene-card-title" data-preview="scene-title">Starting Soon</p>',
    '      <p class="program-scene-card-subtitle preview-stage__scene-card-subtitle" id="program-scene-card-subtitle" data-preview="scene-subtitle">Maka is warming up — hang tight</p>',
    '    </div>',
    '  </div>',
    '  <p class="program-empty preview-stage__empty" id="program-empty" data-preview="empty">' +
      EMPTY_COPY +
      '</p>',
    '</div>',
  ].join('\n');
}

function collectEls(root) {
  const scope = $(root, '.preview-stage') || root;
  return {
    stage: $(root, '.preview-stage') || root,
    program: $(root, '#program-video, [data-preview="program"], .preview-stage__program'),
    cam: $(root, '#program-cam, [data-preview="cam"], .preview-stage__cam, .program-cam'),
    camVideo: $(root, '#program-cam-video, [data-preview="cam-video"], .preview-stage__cam-video'),
    camOffline: $(root, '#program-cam-offline, [data-preview="cam-offline"], .program-cam-offline'),
    sceneCard: $(root, '#program-scene-card, [data-preview="scene-card"], .program-scene-card'),
    sceneTitle: $(root, '#program-scene-card-title, [data-preview="scene-title"]'),
    sceneSubtitle: $(root, '#program-scene-card-subtitle, [data-preview="scene-subtitle"]'),
    empty: $(root, '#program-empty, [data-preview="empty"], .program-empty'),
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
  /** Last requested / observed displaySurface for audio routing. */
  let lastDisplaySurface = 'browser';
  /** Show PIP chrome even without a live track (matches app mock). */
  let webcamPipDesired = true;
  let destroyed = false;
  /** @type {MutationObserver | null} */
  let liveClassObserver = null;

  function isProgramLive() {
    const program =
      root.closest('.program') ||
      (typeof document !== 'undefined' ? document.getElementById('program') : null);
    if (program && program.classList.contains('is-live')) return true;
    if (els.stage && els.stage.classList.contains('is-live')) return true;
    return false;
  }

  function syncUi() {
    if (destroyed) return;
    const hasScreen = Boolean(
      screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live'),
    );
    const hasCam = Boolean(
      webcamStream && webcamStream.getVideoTracks().some((t) => t.readyState === 'live'),
    );
    const live = isProgramLive();

    // Game Capture owns the full program bed. Webcam never fills the stage alone.
    if (hasScreen) {
      if (els.program.srcObject !== screenStream) els.program.srcObject = screenStream;
      els.program.hidden = false;
      void els.program.play().catch(() => undefined);
    } else {
      els.program.srcObject = null;
      els.program.hidden = true;
    }

    if (els.cam) {
      if (webcamPipDesired) {
        els.cam.hidden = false;
        if (hasCam && els.camVideo) {
          if (els.camVideo.srcObject !== webcamStream) els.camVideo.srcObject = webcamStream;
          els.camVideo.hidden = false;
          if (els.camOffline) els.camOffline.hidden = true;
          void els.camVideo.play().catch(() => undefined);
        } else if (els.camVideo) {
          els.camVideo.srcObject = null;
          els.camVideo.hidden = true;
          if (els.camOffline) {
            els.camOffline.hidden = false;
            els.camOffline.textContent = WEBCAM_OFFLINE;
          }
        }
      } else {
        els.cam.hidden = true;
        if (els.camVideo) els.camVideo.srcObject = null;
      }
    }

    if (els.empty) {
      els.empty.textContent = '';
      els.empty.hidden = true;
    }

    const detail = {
      hasScreen,
      hasWebcam: hasCam,
      hasCapture: hasScreen || hasCam,
      sceneName: '',
    };
    root.dispatchEvent(new CustomEvent('maka:preview-change', { bubbles: true, detail }));
    // Mirror on window so live.js listeners fire even if a parent stops propagation.
    window.dispatchEvent(new CustomEvent('maka:preview-change', { detail }));
  }

  function setSceneName(_name) {
    // Scene name overlay removed — keep API for callers but never show chrome.
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
        card.subtitle || 'Maka is warming up — hang tight';
    }
    const brandEl =
      els.sceneCard.querySelector('.program-scene-card-brand, [data-preview="scene-brand"]') ||
      null;
    if (brandEl) brandEl.textContent = card.brand || 'MAKA';
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

  /**
   * @param {{ displaySurface?: 'browser' | 'window' | 'monitor' }} [opts]
   * displaySurface is a UA hint when supported; the browser share dialog still lists
   * tab / window / screen as the platform allows.
   */
  async function startScreen(opts = {}) {
    if (destroyed) return null;
    stopScreen();
    const surface =
      opts && typeof opts.displaySurface === 'string' ? opts.displaySurface : 'browser';
    lastDisplaySurface = surface;
    try {
      // Prefer requested surface (tab / window / screen); fall back if the UA rejects constraints.
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: surface,
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
        try {
          const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
          if (settings && typeof settings.displaySurface === 'string' && settings.displaySurface) {
            lastDisplaySurface = settings.displaySurface;
          }
        } catch (_) {
          /* optional */
        }
        track.addEventListener('ended', () => {
          if (screenStream === stream) {
            screenStream = null;
            clearDisplayAudioFromMixer();
            syncUi();
          }
        });
      }
      routeDisplayAudioToMixer(stream, lastDisplaySurface);
      syncUi();
      return stream;
    } catch (err) {
      console.warn('[preview] getDisplayMedia failed', err);
      clearDisplayAudioFromMixer();
      syncUi();
      return null;
    }
  }

  /**
   * @param {string | { deviceId?: string }} [opts]
   * Pass a deviceId (from enumerateDevices) to bind that camera into the webcam PIP.
   */
  async function startWebcam(opts = {}) {
    if (destroyed) return null;
    stopWebcam();
    const deviceId =
      typeof opts === 'string'
        ? opts
        : opts && typeof opts.deviceId === 'string'
          ? opts.deviceId
          : '';
    try {
      const video = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };
      if (deviceId) video.deviceId = { exact: deviceId };
      const stream = await navigator.mediaDevices.getUserMedia({
        video,
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
    clearDisplayAudioFromMixer();
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
      const surfaceHint =
        opts && typeof opts.displaySurface === 'string' ? opts.displaySurface : lastDisplaySurface;
      lastDisplaySurface = surfaceHint || lastDisplaySurface;
      const track = screenStream.getVideoTracks()[0];
      if (track) {
        try {
          const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
          if (settings && typeof settings.displaySurface === 'string' && settings.displaySurface) {
            lastDisplaySurface = settings.displaySurface;
          }
        } catch (_) {
          /* optional */
        }
        track.addEventListener('ended', () => {
          if (screenStream === stream) {
            screenStream = null;
            clearDisplayAudioFromMixer();
            syncUi();
          }
        });
      }
      routeDisplayAudioToMixer(screenStream, lastDisplaySurface);
    } else {
      clearDisplayAudioFromMixer();
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

    if (!els.program.hidden) drawContain(els.program, 0, 0, canvas.width, canvas.height);

    if (els.cam && !els.cam.hidden && els.camVideo && !els.camVideo.hidden) {
      const pipW = Math.round(canvas.width * 0.22);
      const pipH = Math.round(pipW * (9 / 16));
      const x = canvas.width - pipW - Math.round(canvas.width * 0.045);
      const y = canvas.height - pipH - Math.round(canvas.height * 0.055);
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, pipW + 3, pipH + 3);
      // Match CSS object-fit: contain so the full webcam frame is visible.
      drawContain(els.camVideo, x, y, pipW, pipH);
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
    // Ignore detail.name — scene name overlay is intentionally not shown.
    if (detail.card !== undefined) setSceneCard(detail.card);
    if (typeof detail.webcamPip === 'boolean') setWebcamPipVisible(detail.webcamPip);
  }

  root.addEventListener('maka:scene-change', onSceneEvent);
  window.addEventListener('maka:scene-change', onSceneEvent);

  // Legacy shell IDs only — never #studio-source-* (scenes owns those for layer toggle).
  const externalScreen = document.getElementById('btn-screen');
  const externalWebcam = document.getElementById('btn-webcam');
  if (externalScreen) externalScreen.addEventListener('click', onScreenClick);
  if (externalWebcam) externalWebcam.addEventListener('click', onWebcamClick);

  const programHost =
    root.closest('.program') ||
    (typeof document !== 'undefined' ? document.getElementById('program') : null);
  if (programHost && typeof MutationObserver === 'function') {
    liveClassObserver = new MutationObserver(() => {
      if (!destroyed) syncUi();
    });
    liveClassObserver.observe(programHost, { attributes: true, attributeFilter: ['class'] });
  }

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
      if (externalScreen) externalScreen.removeEventListener('click', onScreenClick);
      if (externalWebcam) externalWebcam.removeEventListener('click', onWebcamClick);
      root.removeEventListener('maka:scene-change', onSceneEvent);
      window.removeEventListener('maka:scene-change', onSceneEvent);
      if (liveClassObserver) {
        liveClassObserver.disconnect();
        liveClassObserver = null;
      }
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
