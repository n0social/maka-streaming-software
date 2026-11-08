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
 *   - #program-cam and #program-video stay hidden while that Sources row is
 *     unhighlighted (data-active="0"). syncUi, startWebcam, setWebcamStream, and
 *     scene events must not show them again until the row is highlighted.
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
  /** Show the webcam box (live track or offline placeholder). Row highlight wins once set. */
  let webcamPipDesired = false;
  /** Show #program-video when a share is live. Unhighlighted keeps the black bed. */
  let gameCaptureDesired = false;
  let destroyed = false;
  /** @type {MutationObserver | null} */
  let liveClassObserver = null;

  /**
   * Sources row gold state, once scenes has written it.
   * @returns {boolean | null} null when the row has not been synced yet
   */
  function sourceRowShown(id) {
    if (typeof document === 'undefined') return null;
    const row = document.getElementById(id);
    if (!row) return null;
    const active = row.getAttribute('data-active');
    if (active === '1') return true;
    if (active === '0') return false;
    return null;
  }

  /** Gold row wins: an unhighlighted source stays hidden even if a flag was left on. */
  function rowAllows(id) {
    const row = sourceRowShown(id);
    if (row === null) return true;
    return row;
  }

  function hasLiveVideo(stream) {
    return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));
  }

  /** What the program canvas is allowed to paint. Draw loop reads these, not CSS alone. */
  let drawCam = false;
  let drawGame = false;

  function syncUi() {
    if (destroyed) return;
    const hasScreen = hasLiveVideo(screenStream);
    const hasCam = hasLiveVideo(webcamStream);
    // Both the explicit flag and the gold row must agree. startWebcam / setWebcamStream
    // must not flip the flag back on, or a hidden row would reappear on the next sync.
    const showGame = gameCaptureDesired && rowAllows('studio-source-game') && hasScreen;
    const showCam = webcamPipDesired && rowAllows('studio-source-webcam');
    drawGame = showGame;
    drawCam = showCam && hasCam;

    // Game Capture owns the picture. Hiding it leaves the black bed — never a full-frame webcam.
    if (hasScreen && screenStream && els.program.srcObject !== screenStream) {
      els.program.srcObject = screenStream;
    } else if (!hasScreen && els.program.srcObject) {
      els.program.srcObject = null;
    }
    els.program.hidden = !showGame;
    if (showGame) void els.program.play().catch(() => undefined);

    if (els.cam) {
      els.cam.hidden = !showCam;
      if (els.camVideo) {
        if (hasCam && webcamStream && els.camVideo.srcObject !== webcamStream) {
          els.camVideo.srcObject = webcamStream;
        } else if (!hasCam) {
          els.camVideo.srcObject = null;
        }
        // Keep the MediaStream attached while hidden so the track stays live.
        els.camVideo.hidden = !(showCam && hasCam);
        if (showCam && hasCam) void els.camVideo.play().catch(() => undefined);
      }
      if (els.camOffline) {
        els.camOffline.hidden = !(showCam && !hasCam);
        if (showCam && !hasCam) els.camOffline.textContent = WEBCAM_OFFLINE;
      }
    }

    if (els.empty) {
      els.empty.textContent = '';
      els.empty.hidden = true;
    }

    if (els.stage) {
      els.stage.dataset.gameBed = showGame ? 'capture' : 'black';
      els.stage.dataset.drawCam = drawCam ? '1' : '0';
      els.stage.dataset.drawGame = drawGame ? '1' : '0';
    }

    // Keep a paintable copy of the share even while #program-video is hidden.
    // display:none can zero a display-capture's layout size so drawImage paints nothing.
    syncGamePaint(hasScreen ? screenStream : null);
    if (programStream) {
      drawProgramFrame();
      requestProgramFrame();
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

  function setGameVisible(show) {
    gameCaptureDesired = Boolean(show);
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
    stopGamePaint();
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

  let programCanvas = null;
  let programStream = null;
  let programDrawTimer = 0;
  /** @type {HTMLVideoElement | null} Dedicated draw source. Never display:none. */
  let paintVideo = null;
  /** @type {MediaStream | null} */
  let paintedStream = null;
  /** @type {ReadableStreamDefaultReader<VideoFrame> | null} */
  let frameReader = null;
  /** @type {VideoFrame | null} */
  let latestGameFrame = null;
  /** @type {MediaStreamTrack[]} clones owned by the paint path — never the live share */
  let paintClones = [];
  let framePumpToken = 0;

  function ensureProgramCanvas() {
    if (!programCanvas) {
      programCanvas = document.createElement('canvas');
      programCanvas.width = 1280;
      programCanvas.height = 720;
    }
    return programCanvas;
  }

  function closeLatestGameFrame() {
    if (!latestGameFrame) return;
    try {
      latestGameFrame.close();
    } catch (_) {
      /* already closed */
    }
    latestGameFrame = null;
  }

  /**
   * Display-capture frames often refuse to paint from a display:none video
   * (videoWidth stays 0, drawImage writes nothing). This element stays in the
   * document with a real box; opacity keeps it out of the preview.
   */
  function ensurePaintVideo() {
    if (paintVideo && paintVideo.isConnected) return paintVideo;
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.width = 160;
    video.height = 90;
    video.style.cssText = [
      'position:fixed',
      'left:0',
      'bottom:0',
      'width:160px',
      'height:90px',
      'opacity:0',
      'pointer-events:none',
      'z-index:-1',
      'transform:translateZ(0)',
    ].join(';');
    (document.body || root).appendChild(video);
    paintVideo = video;
    return video;
  }

  function stopGamePaint() {
    framePumpToken += 1;
    const reader = frameReader;
    frameReader = null;
    if (reader) {
      reader.cancel().catch(() => undefined);
    }
    closeLatestGameFrame();
    paintClones.forEach((track) => {
      try {
        track.stop();
      } catch (_) {
        /* ignore */
      }
    });
    paintClones = [];
    paintedStream = null;
    if (paintVideo) paintVideo.srcObject = null;
  }

  function watchPaintFrames(video, token) {
    if (!video.requestVideoFrameCallback) return;
    const loop = () => {
      if (destroyed || framePumpToken !== token) return;
      if (drawGame && programStream) {
        drawProgramFrame();
        requestProgramFrame();
      }
      video.requestVideoFrameCallback(loop);
    };
    video.requestVideoFrameCallback(loop);
  }

  function syncGamePaint(stream) {
    if (paintedStream === stream) return;
    stopGamePaint();
    if (!stream) return;
    const track = stream.getVideoTracks().find((t) => t.readyState === 'live');
    if (!track) return;
    paintedStream = stream;
    const video = ensurePaintVideo();
    // Same MediaStream as the preview, but this element is never display:none.
    video.srcObject = stream;
    const token = framePumpToken;
    const arm = () => watchPaintFrames(video, token);
    void video.play().then(arm).catch(arm);

    if (typeof MediaStreamTrackProcessor !== 'function' || typeof track.clone !== 'function') return;
    let clone = null;
    try {
      clone = track.clone();
    } catch (_) {
      clone = null;
    }
    if (!clone) return;
    paintClones.push(clone);
    try {
      const processor = new MediaStreamTrackProcessor({ track: clone });
      const reader = processor.readable.getReader();
      frameReader = reader;
      void (async () => {
        try {
          while (framePumpToken === token) {
            const { value, done } = await reader.read();
            if (done || framePumpToken !== token) {
              if (value && typeof value.close === 'function') value.close();
              break;
            }
            closeLatestGameFrame();
            latestGameFrame = value;
          }
        } catch (_) {
          /* track ended */
        }
      })();
    } catch (_) {
      try {
        clone.stop();
      } catch (_) {
        /* ignore */
      }
      paintClones = paintClones.filter((t) => t !== clone);
    }
  }

  function sourceSize(source) {
    if (!source) return null;
    try {
      if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) {
        const w = source.displayWidth || source.codedWidth || 0;
        const h = source.displayHeight || source.codedHeight || 0;
        if (w < 2 || h < 2) return null;
        return { w, h };
      }
      if (source.readyState < 2 || !source.videoWidth || !source.videoHeight) return null;
      return { w: source.videoWidth, h: source.videoHeight };
    } catch (_) {
      return null;
    }
  }

  /** object-fit: cover. Returns false when this source has no frame yet. */
  function drawCover(ctx, source, dx, dy, dw, dh) {
    const size = sourceSize(source);
    if (!size || dw < 2 || dh < 2) return false;
    const scale = Math.max(dw / size.w, dh / size.h);
    const tw = size.w * scale;
    const th = size.h * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    try {
      ctx.drawImage(
        source,
        0,
        0,
        size.w,
        size.h,
        dx + (dw - tw) / 2,
        dy + (dh - th) / 2,
        tw,
        th,
      );
    } catch (_) {
      ctx.restore();
      return false;
    }
    ctx.restore();
    return true;
  }

  function gamePaintSources() {
    const sources = [];
    if (latestGameFrame) sources.push(latestGameFrame);
    const visible = els.program;
    if (
      visible &&
      !visible.hidden &&
      visible.clientWidth >= 2 &&
      visible.clientHeight >= 2
    ) {
      sources.push(visible);
    }
    if (paintVideo && paintVideo.clientWidth >= 2 && paintVideo.clientHeight >= 2) {
      sources.push(paintVideo);
    }
    return sources;
  }

  function drawGameInto(ctx, rect) {
    const sources = gamePaintSources();
    for (let i = 0; i < sources.length; i += 1) {
      if (drawCover(ctx, sources[i], rect.x, rect.y, rect.w, rect.h)) return true;
    }
    return false;
  }

  function elementFrame(el, canvas) {
    if (!el || el.hidden) return null;
    const stage = (els.stage && els.stage.getBoundingClientRect()) || root.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (!stage.width || !stage.height || rect.width < 2 || rect.height < 2) return null;
    return {
      x: ((rect.left - stage.left) / stage.width) * canvas.width,
      y: ((rect.top - stage.top) / stage.height) * canvas.height,
      w: (rect.width / stage.width) * canvas.width,
      h: (rect.height / stage.height) * canvas.height,
    };
  }

  function drawProgramFrame() {
    const canvas = ensureProgramCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Black bed stays when Game Capture is unhighlighted or the frame is not ready.
    // Never paint the webcam full-frame in its place.
    if (drawGame) {
      const game = (els.program && elementFrame(els.program, canvas)) || {
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
      };
      drawGameInto(ctx, game);
    }
    if (drawCam && els.cam && !els.cam.hidden && els.camVideo && !els.camVideo.hidden) {
      const cam = elementFrame(els.cam, canvas);
      if (cam) drawCover(ctx, els.camVideo, cam.x, cam.y, cam.w, cam.h);
    }
  }

  function requestProgramFrame() {
    if (!programStream) return;
    // drawImage(video) can stay pending until a readback. Flush before the
    // manual capture frame, or MediaRecorder keeps the previous black bed.
    if (programCanvas) {
      const readCtx = programCanvas.getContext('2d');
      if (readCtx) {
        try {
          readCtx.getImageData(0, 0, 1, 1);
        } catch (_) {
          /* ignore */
        }
      }
    }
    const track = programStream.getVideoTracks()[0];
    if (track && typeof track.requestFrame === 'function') {
      try {
        track.requestFrame();
      } catch (_) {
        /* optional */
      }
    }
  }

  function tickProgramFrame() {
    drawProgramFrame();
    requestProgramFrame();
    programDrawTimer = window.setTimeout(tickProgramFrame, 1000 / 30);
  }

  /** Black game bed plus the webcam in its current overlay slot. */
  function getProgramStream() {
    const canvas = ensureProgramCanvas();
    drawProgramFrame();
    if (!programStream) programStream = canvas.captureStream(0);
    requestProgramFrame();
    if (!programDrawTimer) tickProgramFrame();
    return programStream;
  }

  function captureFrameCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (drawGame) {
      const game = (els.program && elementFrame(els.program, canvas)) || {
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
      };
      drawGameInto(ctx, game);
    }

    if (drawCam && els.cam && !els.cam.hidden && els.camVideo && !els.camVideo.hidden) {
      const pipW = Math.round(canvas.width * 0.22);
      const pipH = Math.round(pipW * (9 / 16));
      const x = canvas.width - pipW - Math.round(canvas.width * 0.045);
      const y = canvas.height - pipH - Math.round(canvas.height * 0.055);
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, pipW + 3, pipH + 3);
      drawCover(ctx, els.camVideo, x, y, pipW, pipH);
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

  // Stay hidden until the Webcam / Game Capture rows are highlighted.
  syncUi();

  const api = {
    root,
    setSceneName,
    setSceneCard,
    setWebcamPipVisible,
    setGameVisible,
    setChromeVisible,
    startScreen,
    startWebcam,
    stopScreen,
    stopWebcam,
    setScreenStream,
    setWebcamStream,
    getStreams,
    getProgramStream,
    captureFrameCanvas,
    /** Flags the compose loop paints from. cam/game are false while that source is hidden. */
    getComposeVisibility() {
      return {
        cam: drawCam,
        game: drawGame,
        webcamPipDesired,
        gameCaptureDesired,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (programDrawTimer) {
        window.clearTimeout(programDrawTimer);
        programDrawTimer = 0;
      }
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
      stopGamePaint();
      if (paintVideo) {
        paintVideo.remove();
        paintVideo = null;
      }
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
