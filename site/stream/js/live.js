/**
 * OWNER: web-studio-port / Go Live controls
 * site/stream/js/live.js — do not replace with a stub.
 *
 * Web studio Go Live / relay / WHIP controls.
 *
 * Desktop (exe) spawns TabcastRelay/MAKArelay as a sidecar and polls
 * http://127.0.0.1:38473/health via the main process. The web client cannot
 * start that process — it only probes the same local endpoints from the
 * browser. A CDN /relay proxy is staging-only and is never treated as the
 * user's encoder (keys stay on the streamer's PC).
 *
 * Contract: src/shared/tabcast.ts, src/renderer/relay-client.ts, src/renderer/whip.ts
 * Optional preview handoff: window.initPreview / #studio-preview._makaPreview
 */
(function (global) {
  'use strict';

  var RELAY_PORT = 38473;
  var RELAY_FETCH_MS = 8000;
  var STATUS_POLL_MS = 2500;
  var PATHS = {
    health: '/health',
    status: '/status',
    config: '/config',
    stop: '/stop',
    scene: '/scene',
    whip: '/whip',
  };
  var TRACK_IDS = { gameplay: 'gameplay', webcam: 'webcam', mic: 'mic' };

  function resolveRelayCandidates() {
    var params = new URLSearchParams(window.location.search);
    var relayParam = (params.get('relay') || '').trim().replace(/\/$/, '');
    if (relayParam) return [relayParam];
    return ['http://127.0.0.1:' + RELAY_PORT, 'http://localhost:' + RELAY_PORT];
  }

  function sanitizeTitle(raw) {
    return String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 140);
  }

  function sanitizeCategory(raw) {
    return String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 100);
  }

  function isPageLocalhost() {
    var host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  function namedStream(id, tracks) {
    var stream = new MediaStream(tracks);
    Object.defineProperty(stream, 'id', { value: id, writable: false, configurable: true });
    return stream;
  }

  function waitForIce(pc, timeoutMs) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(function (resolve) {
      var done = function () {
        pc.removeEventListener('icegatheringstatechange', onChange);
        clearTimeout(timer);
        resolve();
      };
      var onChange = function () {
        if (pc.iceGatheringState === 'complete') done();
      };
      pc.addEventListener('icegatheringstatechange', onChange);
      var timer = setTimeout(done, timeoutMs || 4000);
    });
  }

  /**
   * @param {ParentNode | Document | null} [root]
   * @returns {{ probeRelay: Function, goLive: Function, endLive: Function, destroy: Function } | null}
   */
  function initLive(root) {
    if (global.__makaLiveApi && typeof global.__makaLiveApi.destroy === 'function') {
      return global.__makaLiveApi;
    }
    var doc = root && root.querySelector ? root : document;
    var els = {
      canvas: doc.getElementById('program-canvas'),
      empty: doc.getElementById('program-empty'),
      statusDot: doc.getElementById('relay-status-dot'),
      statusText: doc.getElementById('relay-status-text'),
      relayDetail: doc.getElementById('relay-detail'),
      log: doc.getElementById('stream-log'),
      btnWebcam: doc.getElementById('btn-webcam'),
      btnScreen: doc.getElementById('btn-screen'),
      btnMic: doc.getElementById('btn-mic'),
      btnGoLive: doc.getElementById('btn-go-live'),
      btnGoLiveSidebar: doc.getElementById('btn-go-live-sidebar'),
      btnGoLiveLabel: doc.getElementById('btn-go-live-label'),
      btnRelayRefresh: doc.getElementById('btn-relay-refresh'),
      streamTitle: doc.getElementById('stream-title-input'),
      streamCategory: doc.getElementById('stream-category-input'),
      livePill: doc.getElementById('stream-live-pill'),
      streamDuration: doc.getElementById('stream-duration'),
      streamViewers: doc.getElementById('stream-viewers'),
      cfgProfile: doc.getElementById('cfg-profile'),
      modal: doc.getElementById('relay-modal'),
      modalClose: doc.getElementById('modal-close'),
      modalBody: doc.getElementById('modal-body'),
      previewHost: doc.getElementById('studio-preview'),
    };

    // Need at least Go Live chrome or a canvas to own this page slice.
    if (!els.btnGoLive && !els.btnGoLiveSidebar && !els.canvas && !els.statusText) {
      return null;
    }

    var relayCandidates = resolveRelayCandidates();
    var relayBase = relayCandidates[0];
    var relayHealth = null;
    var relayDetected = false;
    var whipPublisher = null;
    var statusPollTimer = 0;
    var liveStartedAt = 0;
    var durationTimer = 0;
    var destroyed = false;

    var screenStream = null;
    var webcamStream = null;
    var micStream = null;
    var ownsCapture = Boolean(els.canvas && els.btnWebcam);
    var ctx = els.canvas ? els.canvas.getContext('2d') : null;
    var videoEls = new Map();
    var raf = 0;

    function log(line) {
      if (!els.log) return;
      var ts = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      els.log.textContent =
        (els.log.textContent ? els.log.textContent + '\n' : '') + '[' + ts + '] ' + line;
      els.log.scrollTop = els.log.scrollHeight;
    }

    function authHeaders() {
      if (!relayHealth || !relayHealth.relayToken) return {};
      return { Authorization: 'Bearer ' + relayHealth.relayToken };
    }

    function relayFetch(path, init) {
      var opts = init || {};
      return fetch(relayBase + path, {
        method: opts.method || 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: opts.signal || AbortSignal.timeout(RELAY_FETCH_MS),
        headers: Object.assign(
          { Accept: 'application/json' },
          authHeaders(),
          opts.headers || {},
        ),
        body: opts.body,
      });
    }

    function setRelayChrome(state, text, detail) {
      if (els.statusDot) els.statusDot.dataset.state = state;
      if (els.statusText) els.statusText.textContent = text;
      var chip = document.getElementById('relay-chip');
      if (chip) {
        // Mirror desktop relay-chip lifecycle tokens where possible.
        chip.dataset.state =
          state === 'live' ? 'live' : state === 'ok' ? 'ready' : 'stopped';
      }
      if (els.relayDetail) {
        els.relayDetail.textContent =
          detail ||
          (relayDetected
            ? 'Local sidecar at ' + relayBase + ' — WHIP in, RTMP out on this PC only.'
            : 'Relay sidecar is local-only (127.0.0.1:' +
              RELAY_PORT +
              '). This website cannot start or proxy your encoder — install Maka / MAKArelay.exe, or run a local mock relay for testing.');
      }
    }

    function formatDuration(ms) {
      var total = Math.max(0, Math.floor(ms / 1000));
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      var mm = m < 10 ? '0' + m : String(m);
      var ss = s < 10 ? '0' + s : String(s);
      return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
    }

    function setLiveUi(isLive) {
      if (els.livePill) {
        els.livePill.dataset.live = isLive ? 'true' : 'false';
        els.livePill.textContent = isLive ? 'Live' : 'Offline';
      }
      if (els.btnGoLive) {
        els.btnGoLive.textContent = isLive ? 'End Live' : 'Go Live';
        els.btnGoLive.dataset.live = isLive ? '1' : '0';
      }
      if (els.btnGoLiveLabel) {
        els.btnGoLiveLabel.textContent = isLive ? 'End Streaming' : 'Start Streaming';
      }
      if (els.btnGoLiveSidebar) {
        els.btnGoLiveSidebar.dataset.live = isLive ? '1' : '0';
      }
      if (els.streamViewers) {
        els.streamViewers.textContent = isLive ? 'Local relay' : '—';
        els.streamViewers.title = isLive
          ? 'Publishing WHIP to the local sidecar — not a CDN viewer count'
          : 'Viewer count only appears after a real platform ingest';
      }
      if (!isLive) {
        liveStartedAt = 0;
        if (durationTimer) {
          clearInterval(durationTimer);
          durationTimer = 0;
        }
        if (els.streamDuration) els.streamDuration.textContent = '—';
      } else if (!durationTimer) {
        liveStartedAt = Date.now();
        durationTimer = window.setInterval(function () {
          if (els.streamDuration && liveStartedAt) {
            els.streamDuration.textContent = formatDuration(Date.now() - liveStartedAt);
          }
        }, 1000);
      }
    }

    function getPreviewApi() {
      if (els.previewHost && els.previewHost._makaPreview) return els.previewHost._makaPreview;
      if (global.MakaPreview) return global.MakaPreview;
      return null;
    }

    function readPreviewStreams() {
      var api = getPreviewApi();
      if (!api || typeof api.getStreams !== 'function') return null;
      try {
        return api.getStreams();
      } catch (_err) {
        return null;
      }
    }

    function hasCapture() {
      var preview = readPreviewStreams();
      if (preview) {
        var screenOk = Boolean(preview.screen && preview.screen.getVideoTracks()[0]);
        var camOk = Boolean(preview.webcam && preview.webcam.getVideoTracks()[0]);
        if (screenOk || camOk) return true;
      }
      return Boolean(
        (screenStream && screenStream.getVideoTracks()[0]) ||
          (webcamStream && webcamStream.getVideoTracks()[0]),
      );
    }

    function updateButtons() {
      var live = Boolean(whipPublisher);
      if (els.btnGoLive) els.btnGoLive.disabled = live ? false : !hasCapture();
      if (els.btnGoLiveSidebar) els.btnGoLiveSidebar.disabled = live ? false : !hasCapture();
      if (els.btnGoLive) {
        els.btnGoLive.title = live
          ? 'End WHIP session'
          : hasCapture()
            ? 'Publish WHIP to local relay'
            : 'Add a webcam or screen share preview first';
        if (els.btnGoLiveSidebar) els.btnGoLiveSidebar.title = els.btnGoLive.title;
      }
      setLiveUi(live);
    }

    async function probeOne(base) {
      var res = await fetch(base + PATHS.health, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(RELAY_FETCH_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (!data || data.ok !== true) throw new Error('health ok=false');
      return { base: base, health: data };
    }

    async function probeRelay(opts) {
      var options = opts || {};
      var quiet = Boolean(options.quiet);
      var lastError = null;
      relayCandidates = resolveRelayCandidates();

      for (var i = 0; i < relayCandidates.length; i++) {
        var base = relayCandidates[i];
        try {
          var hit = await probeOne(base);
          relayBase = hit.base;
          relayHealth = hit.health;
          relayDetected = true;
          var version = hit.health.version || '?';
          var mock = String(version).indexOf('mock') !== -1;
          var label = mock
            ? 'Relay detected · mock v' + version
            : 'Relay detected · v' + version;
          setRelayChrome(
            'ok',
            label,
            'Connected to ' +
              relayBase +
              PATHS.health +
              '. Sidecar is local-only — RTMP keys never leave this PC.',
          );
          if (!quiet) log('Relay detected at ' + relayBase + ' (v' + version + ').');
          await refreshRelayStatus();
          startStatusPoll();
          return true;
        } catch (err) {
          lastError = err;
        }
      }

      relayHealth = null;
      relayDetected = false;
      stopStatusPoll();
      setRelayChrome(
        'warn',
        'Relay not detected',
        'No response from ' +
          relayCandidates.join(' or ') +
          PATHS.health +
          '. The desktop app starts MAKArelay.exe locally; this browser page can only talk to a relay already listening on your machine.',
      );
      if (!quiet) {
        var reason =
          lastError instanceof Error ? lastError.message : String(lastError || 'unreachable');
        log(
          'Relay not detected (' +
            reason +
            '). Sidecar is local-only — run Maka, MAKArelay.exe, or a local mock relay.',
        );
      }
      return false;
    }

    async function refreshRelayStatus() {
      if (!relayDetected || !relayHealth) return null;
      try {
        var res = await relayFetch(PATHS.status);
        if (!res.ok) return null;
        var status = await res.json();
        if (whipPublisher && status && status.status === 'live') {
          setRelayChrome('live', 'Live · relay encoding', null);
        } else if (status && status.status === 'error') {
          setRelayChrome('warn', status.error || 'Relay error', null);
        }
        return status;
      } catch (_err) {
        return null;
      }
    }

    function startStatusPoll() {
      stopStatusPoll();
      statusPollTimer = window.setInterval(function () {
        void refreshRelayStatus();
      }, STATUS_POLL_MS);
    }

    function stopStatusPoll() {
      if (statusPollTimer) {
        clearInterval(statusPollTimer);
        statusPollTimer = 0;
      }
    }

    async function postRelayConfig() {
      if (!relayHealth) throw new Error('Relay not connected');
      var body = { profile: (els.cfgProfile && els.cfgProfile.value) || '720p30' };
      var title = sanitizeTitle(els.streamTitle && els.streamTitle.value);
      var category = sanitizeCategory(els.streamCategory && els.streamCategory.value);
      if (title) body.streamTitle = title;
      if (category) body.streamCategory = category;
      var res = await relayFetch(PATHS.config, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        var detail = (await res.text().catch(function () {
          return '';
        })).trim();
        throw new Error('Config failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
      }
      log('POST /config applied (title/category → relay RAM).');
    }

    async function postSceneLayout() {
      if (!relayHealth) return;
      var w = (els.canvas && els.canvas.width) || 1280;
      var h = (els.canvas && els.canvas.height) || 720;
      var layout = {
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
      var streams = readPreviewStreams();
      var hasCam = Boolean(
        (streams && streams.webcam) || (webcamStream && webcamStream.getVideoTracks()[0]),
      );
      if (hasCam) {
        var pipW = Math.round(w * 0.22);
        var pipH = Math.round(pipW * (9 / 16));
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
      }).catch(function () {
        /* non-fatal */
      });
    }

    async function postRelayStop() {
      if (!relayDetected) return;
      await relayFetch(PATHS.stop, { method: 'POST' }).catch(function () {
        return undefined;
      });
    }

    function attachWhipSources(pc, sources) {
      var add = function (stream, id) {
        if (!stream) return;
        var tracks = stream.getTracks().filter(function (t) {
          return t.readyState === 'live';
        });
        if (!tracks.length) return;
        var named = namedStream(id, tracks);
        for (var i = 0; i < tracks.length; i++) pc.addTrack(tracks[i], named);
      };
      add(sources.gameplay, TRACK_IDS.gameplay);
      add(sources.webcam, TRACK_IDS.webcam);
      add(sources.mic, TRACK_IDS.mic);
    }

    async function publishWhip(sources) {
      var pc = new RTCPeerConnection({ iceServers: [] });
      attachWhipSources(pc, sources);
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc, 5000);
      var sdp = pc.localDescription && pc.localDescription.sdp;
      if (!sdp) {
        pc.close();
        throw new Error('Empty WHIP offer');
      }
      var response = await fetch(relayBase + PATHS.whip, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: Object.assign({ 'Content-Type': 'application/sdp' }, authHeaders()),
        body: sdp,
        signal: AbortSignal.timeout(RELAY_FETCH_MS),
      });
      if (!response.ok) {
        pc.close();
        var detail = (await response.text().catch(function () {
          return '';
        })).trim();
        throw new Error('WHIP ' + response.status + (detail ? ': ' + detail : ''));
      }
      var answer = await response.text();
      var location = response.headers.get('Location');
      var resourceUrl = location ? new URL(location, relayBase + PATHS.whip).href : null;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      return {
        pc: pc,
        resourceUrl: resourceUrl,
        close: async function () {
          if (resourceUrl) {
            try {
              await fetch(resourceUrl, {
                method: 'DELETE',
                mode: 'cors',
                headers: authHeaders(),
              });
            } catch (_err) {
              /* ignore */
            }
          }
          pc.close();
        },
      };
    }

    function resolveMicStream() {
      if (micStream && micStream.getAudioTracks()[0]) return micStream;
      if (global.MakaStreamAudio && typeof global.MakaStreamAudio.getStream === 'function') {
        try {
          var audioMic = global.MakaStreamAudio.getStream('mic');
          if (audioMic && audioMic.getAudioTracks()[0]) return audioMic;
        } catch (_err) {
          /* optional bus */
        }
      }
      return null;
    }

    /**
     * Prefer live MediaStream tracks from the preview module (continuous frames).
     * Fallback: canvas.captureStream when this module owns the program canvas.
     * Never invent a CDN media endpoint.
     */
    function buildPublishSources() {
      var previewStreams = readPreviewStreams();
      var screen =
        (previewStreams && previewStreams.screen) ||
        screenStream ||
        null;
      var cam =
        (previewStreams && previewStreams.webcam) ||
        webcamStream ||
        null;
      var main = screen || cam;
      if (!main || !main.getVideoTracks()[0]) {
        if (els.canvas && typeof els.canvas.captureStream === 'function') {
          var canvasStream = els.canvas.captureStream(30);
          if (canvasStream.getVideoTracks()[0]) {
            main = canvasStream;
          }
        }
      }
      if (!main || !main.getVideoTracks()[0]) {
        throw new Error('No program preview to publish');
      }

      var gameplay = namedStream(TRACK_IDS.gameplay, main.getVideoTracks());
      var webcamOut = null;
      // Separate webcam track only when screen is the gameplay bed (PiP path).
      if (screen && cam && cam.getVideoTracks()[0] && screen === main) {
        webcamOut = namedStream(TRACK_IDS.webcam, cam.getVideoTracks());
      }
      var micOut = null;
      var micSrc = resolveMicStream();
      if (micSrc && micSrc.getAudioTracks()[0]) {
        micOut = namedStream(TRACK_IDS.mic, micSrc.getAudioTracks());
      }
      return { gameplay: gameplay, webcam: webcamOut, mic: micOut };
    }

    function showRelayModal(message) {
      if (els.modalBody && message) els.modalBody.textContent = message;
      if (els.modal) els.modal.hidden = false;
    }

    async function onEndLive() {
      if (whipPublisher) {
        await whipPublisher.close().catch(function () {
          return undefined;
        });
        whipPublisher = null;
      }
      await postRelayStop();
      if (relayDetected && relayHealth) {
        setRelayChrome('ok', 'Relay detected · v' + (relayHealth.version || '?'), null);
      } else {
        await probeRelay({ quiet: true });
      }
      await refreshRelayStatus();
      updateButtons();
      log('Stream stopped — no cloud endpoint claimed.');
    }

    async function onGoLive() {
      if (destroyed) return;
      if (whipPublisher) {
        await onEndLive();
        return;
      }
      if (!hasCapture()) {
        log('Add webcam or screen share first — preview required before WHIP.');
        updateButtons();
        return;
      }

      var ok = await probeRelay();
      if (!ok) {
        showRelayModal(
          'No local relay at 127.0.0.1:' +
            RELAY_PORT +
            '. The desktop app launches MAKArelay.exe for you; this browser page only publishes WHIP when that sidecar is already running on this PC. Preview stays local — we will not claim a cloud stream.',
        );
        updateButtons();
        return;
      }

      try {
        try {
          await postRelayConfig();
        } catch (cfgErr) {
          log(
            'Config optional warning: ' +
              (cfgErr instanceof Error ? cfgErr.message : String(cfgErr)),
          );
        }
        await postSceneLayout();
        log('Publishing WHIP to ' + relayBase + PATHS.whip + '…');
        whipPublisher = await publishWhip(buildPublishSources());
        whipPublisher.pc.onconnectionstatechange = function () {
          if (!whipPublisher) return;
          var state = whipPublisher.pc.connectionState;
          log('WHIP connection: ' + state);
          if (state === 'connected') {
            setRelayChrome(
              'live',
              'Live via local relay',
              'WHIP session active on ' +
                relayBase +
                '. Platform RTMP only happens if keys were configured in the local sidecar — not via this website CDN.',
            );
          } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            setRelayChrome('warn', 'WHIP ' + state, null);
          }
        };
        setRelayChrome(
          'live',
          'Live via local relay',
          'WHIP published to the local sidecar. This is not a CDN “live” badge.',
        );
        log('WHIP active — check relay /status for encode / platform state.');
        updateButtons();
        await refreshRelayStatus();
      } catch (err) {
        whipPublisher = null;
        log('Go live failed: ' + (err instanceof Error ? err.message : err));
        showRelayModal(
          'Could not publish WHIP to the local relay. Confirm MAKArelay.exe (or a mock relay) is healthy on port ' +
            RELAY_PORT +
            ', then try again. Preview remains local until WHIP succeeds.',
        );
        updateButtons();
      }
    }

    function resizeCanvas() {
      if (!els.canvas || !els.canvas.parentElement) return;
      var rect = els.canvas.parentElement.getBoundingClientRect();
      var w = Math.max(640, Math.floor(rect.width));
      var h = Math.max(360, Math.floor(rect.height));
      if (els.canvas.width !== w || els.canvas.height !== h) {
        els.canvas.width = w;
        els.canvas.height = h;
      }
    }

    function drawVideo(stream, dx, dy, dw, dh) {
      if (!ctx) return;
      var video = videoEls.get(stream);
      if (!video) {
        video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        videoEls.set(stream, video);
        video.play().catch(function () {
          return undefined;
        });
      }
      if (video.readyState >= 2) {
        var vw = video.videoWidth || 16;
        var vh = video.videoHeight || 9;
        var scale = Math.max(dw / vw, dh / vh);
        var sw = dw / scale;
        var sh = dh / scale;
        var sx = (vw - sw) / 2;
        var sy = (vh - sh) / 2;
        ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
      }
    }

    function drawFrame() {
      if (destroyed || !ownsCapture || !els.canvas || !ctx) return;
      resizeCanvas();
      var w = els.canvas.width;
      var h = els.canvas.height;
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, w, h);
      var main = screenStream || webcamStream;
      if (main && main.getVideoTracks()[0]) drawVideo(main, 0, 0, w, h);
      if (screenStream && webcamStream && webcamStream.getVideoTracks()[0]) {
        var pipW = Math.round(w * 0.22);
        var pipH = Math.round(pipW * (9 / 16));
        var x = w - pipW - 16;
        var y = h - pipH - 16;
        ctx.strokeStyle = '#ffc40c';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 2, y - 2, pipW + 4, pipH + 4);
        drawVideo(webcamStream, x, y, pipW, pipH);
      }
      if (els.empty) els.empty.hidden = Boolean(main);
      raf = requestAnimationFrame(drawFrame);
    }

    function stopMedia(stream) {
      if (!stream) return;
      stream.getTracks().forEach(function (t) {
        t.stop();
      });
      var v = videoEls.get(stream);
      if (v) {
        v.srcObject = null;
        videoEls.delete(stream);
      }
    }

    function onPreviewChange() {
      updateButtons();
      syncRecordingAvailability();
      if (vcamActive) paintVcamFrame();
    }

    // --- P1-2 Stream Controls: Recording / Virtual Cam / platform chips ---
    var REC_MIME_CANDIDATES = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    var PLATFORM_PREF_KEY = 'maka.stream.platformPref.v1';
    var mediaRecorder = null;
    var recordingChunks = [];
    var recordingActive = false;
    var vcamActive = false;
    var vcamRaf = 0;
    var platformPref = { twitch: false, youtube: false };
    var lastPlatformClick = 'none';

    var btnRecording = doc.getElementById('btn-start-recording');
    var btnRecordingLabel = doc.getElementById('btn-recording-label');
    var statRecording = doc.getElementById('stat-recording');
    var btnVcam = doc.getElementById('btn-start-vcam');
    var btnVcamLabel = doc.getElementById('btn-vcam-label');
    var statVcam = doc.getElementById('stat-vcam');
    var vcamMock = doc.getElementById('vcam-preview-mock');
    var vcamCanvas = doc.getElementById('vcam-preview-canvas');
    var vcamNote = doc.getElementById('vcam-preview-note');
    var platTwitch = doc.getElementById('plat-twitch');
    var platYoutube = doc.getElementById('plat-youtube');
    var destHint = doc.getElementById('stream-destinations-hint');

    function pickRecorderMime() {
      if (typeof MediaRecorder === 'undefined') return '';
      for (var i = 0; i < REC_MIME_CANDIDATES.length; i++) {
        if (MediaRecorder.isTypeSupported(REC_MIME_CANDIDATES[i])) return REC_MIME_CANDIDATES[i];
      }
      return '';
    }

    function liveTrack(stream) {
      return Boolean(
        stream &&
          stream.getVideoTracks &&
          stream.getVideoTracks().some(function (t) {
            return t.readyState === 'live';
          }),
      );
    }

    function pickPreviewRecordStream() {
      var streams = readPreviewStreams();
      if (!streams) return null;
      if (liveTrack(streams.screen)) return streams.screen;
      if (liveTrack(streams.webcam)) return streams.webcam;
      return null;
    }

    function setRecordingUi(active) {
      recordingActive = active;
      if (btnRecording) btnRecording.dataset.recording = active ? '1' : '0';
      if (btnRecordingLabel) {
        btnRecordingLabel.textContent = active ? 'Stop Recording' : 'Start Recording';
      }
      if (statRecording) {
        statRecording.dataset.recording = active ? '1' : '0';
        statRecording.textContent = active ? 'Now recording' : 'Not recording';
      }
    }

    function syncRecordingAvailability() {
      if (!btnRecording || recordingActive) return;
      var stream = pickPreviewRecordStream();
      var supported = typeof MediaRecorder !== 'undefined';
      if (!supported) {
        btnRecording.disabled = true;
        btnRecording.title =
          'MediaRecorder is not supported in this browser. Recording is unavailable.';
        return;
      }
      if (!stream) {
        btnRecording.disabled = false;
        btnRecording.title =
          'Add a webcam or screen share preview first, then Start Recording. Records the local preview stream (download on stop).';
        return;
      }
      btnRecording.disabled = false;
      btnRecording.title =
        'Record the preview stream locally (MediaRecorder). Stop to download a WebM. Not streaming.';
    }

    function downloadRecordingBlob(blob) {
      var ext = blob.type && blob.type.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
      var profile = '720p30';
      try {
        var cfg = doc.getElementById('cfg-profile');
        if (cfg && cfg.value) profile = cfg.value;
      } catch (_err) {
        /* ignore */
      }
      var ts = new Date().toISOString().replace(/[:.]/g, '-');
      var name = 'maka-recording-' + ts + '-' + profile + '.' + ext;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
      log('Recording saved: ' + name);
      if (destHint) destHint.textContent = 'Recording downloaded: ' + name;
    }

    async function stopRecordingAndSave() {
      if (!mediaRecorder || !recordingActive) return;
      var rec = mediaRecorder;
      mediaRecorder = null;
      setRecordingUi(false);
      var blob = await new Promise(function (resolve) {
        rec.onstop = function () {
          var type = rec.mimeType || 'video/webm';
          resolve(recordingChunks.length ? new Blob(recordingChunks, { type: type }) : null);
        };
        try {
          rec.stop();
        } catch (_err) {
          resolve(null);
        }
      });
      recordingChunks = [];
      syncRecordingAvailability();
      if (!blob || !blob.size) {
        log('Recording produced no data.');
        if (destHint) destHint.textContent = 'Recording produced no data.';
        return;
      }
      downloadRecordingBlob(blob);
    }

    async function startRecording() {
      var stream = pickPreviewRecordStream();
      if (!stream) {
        log('Cannot record — add a webcam or screen share preview first.');
        if (destHint) {
          destHint.textContent = 'Add a webcam or screen share before recording.';
        }
        syncRecordingAvailability();
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        log('MediaRecorder not supported in this browser.');
        return;
      }
      var mime = pickRecorderMime();
      recordingChunks = [];
      try {
        mediaRecorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
      } catch (err) {
        log('Could not start recorder: ' + (err instanceof Error ? err.message : err));
        mediaRecorder = null;
        return;
      }
      mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size > 0) recordingChunks.push(ev.data);
      };
      mediaRecorder.onerror = function () {
        log('MediaRecorder error — recording stopped.');
        void stopRecordingAndSave();
      };
      try {
        mediaRecorder.start(1000);
      } catch (err) {
        log('Recorder start failed: ' + (err instanceof Error ? err.message : err));
        mediaRecorder = null;
        return;
      }
      setRecordingUi(true);
      log('Recording preview stream locally (stop to download).');
      if (destHint) {
        destHint.textContent = 'Recording local preview… stop to download WebM.';
      }
    }

    function setVcamUi(active) {
      vcamActive = active;
      if (btnVcam) btnVcam.dataset.vcam = active ? '1' : '0';
      if (btnVcamLabel) {
        btnVcamLabel.textContent = active ? 'Stop Virtual Camera' : 'Start Virtual Camera';
      }
      if (statVcam) {
        statVcam.hidden = !active;
        statVcam.dataset.vcam = active ? '1' : '0';
        statVcam.textContent = active ? 'Virtual cam preview' : 'Virtual cam off';
      }
      if (vcamMock) vcamMock.hidden = !active;
      if (btnVcam) {
        btnVcam.title = active
          ? 'Stop preview-only Virtual Cam mirror. Web cannot install a system virtual camera.'
          : 'Web cannot install a system virtual camera. Opens a labeled preview-only PiP that mirrors the program frame.';
      }
    }

    function paintVcamFrame() {
      if (!vcamActive || !vcamCanvas) return;
      var ctx = vcamCanvas.getContext('2d');
      if (!ctx) return;
      var w = vcamCanvas.width;
      var h = vcamCanvas.height;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, w, h);

      var previewApi = getPreviewApi();
      var programVideo = doc.getElementById('program-video');
      var camVideo = doc.getElementById('program-cam-video');
      var drew = false;

      function drawContain(video) {
        if (!video || video.readyState < 2 || !video.videoWidth || video.hidden) return false;
        var vw = video.videoWidth;
        var vh = video.videoHeight;
        var scale = Math.min(w / vw, h / vh);
        var tw = vw * scale;
        var th = vh * scale;
        ctx.drawImage(video, (w - tw) / 2, (h - th) / 2, tw, th);
        return true;
      }

      if (programVideo && !programVideo.hidden) drew = drawContain(programVideo) || drew;
      if (!drew && camVideo) drew = drawContain(camVideo) || drew;

      if (!drew && previewApi && typeof previewApi.captureFrameCanvas === 'function') {
        try {
          var frame = previewApi.captureFrameCanvas();
          if (frame) {
            ctx.drawImage(frame, 0, 0, w, h);
            drew = true;
          }
        } catch (_err) {
          /* ignore */
        }
      }

      if (vcamNote) {
        vcamNote.textContent = drew
          ? 'Preview only — not a system camera'
          : 'No program frame yet — share screen or add webcam';
      }
    }

    function stopVcamLoop() {
      if (vcamRaf) {
        cancelAnimationFrame(vcamRaf);
        vcamRaf = 0;
      }
    }

    function startVcamLoop() {
      stopVcamLoop();
      var tick = function () {
        if (!vcamActive) return;
        paintVcamFrame();
        vcamRaf = requestAnimationFrame(tick);
      };
      vcamRaf = requestAnimationFrame(tick);
    }

    function toggleVcam() {
      if (vcamActive) {
        stopVcamLoop();
        setVcamUi(false);
        log('Virtual Cam preview stopped (web mock only).');
        if (destHint) destHint.textContent = 'Virtual Cam preview stopped.';
        return;
      }
      setVcamUi(true);
      startVcamLoop();
      log(
        'Virtual Cam preview only — browsers cannot install a system virtual camera. Other apps will not see Maka as a device.',
      );
      if (destHint) {
        destHint.textContent =
          'Virtual Cam is preview-only in the browser (no OS camera device).';
      }
    }

    function readPlatformPref() {
      var out = { twitch: false, youtube: false };
      try {
        var raw = localStorage.getItem(PLATFORM_PREF_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            out.twitch = Boolean(parsed.twitch);
            out.youtube = Boolean(parsed.youtube);
          }
        }
      } catch (_err) {
        /* private mode */
      }
      // Fall back / reconcile with settings lastStreamPlatform when pref empty.
      if (!out.twitch && !out.youtube) {
        var last = 'none';
        try {
          if (global.MakaStudioSettings && typeof global.MakaStudioSettings.getSettings === 'function') {
            last = global.MakaStudioSettings.getSettings().lastStreamPlatform || 'none';
          } else {
            var blob = localStorage.getItem('maka.stream.settings.v1');
            if (blob) {
              var s = JSON.parse(blob);
              if (s && s.lastStreamPlatform) last = s.lastStreamPlatform;
            }
          }
        } catch (_err2) {
          /* ignore */
        }
        if (last === 'twitch') out.twitch = true;
        if (last === 'youtube') out.youtube = true;
      }
      return out;
    }

    function primaryPlatformFromPref(pref) {
      if (pref.twitch && !pref.youtube) return 'twitch';
      if (pref.youtube && !pref.twitch) return 'youtube';
      if (pref.twitch && pref.youtube) {
        return lastPlatformClick === 'youtube' ? 'youtube' : 'twitch';
      }
      return 'none';
    }

    function syncPlatformHint(pref) {
      if (!destHint) return;
      var parts = [];
      if (pref.twitch) parts.push('Twitch');
      if (pref.youtube) parts.push('YouTube');
      destHint.textContent = parts.length
        ? 'Preferred destinations: ' + parts.join(' · ')
        : 'No stream destination selected';
    }

    function applyPlatformChips(pref) {
      platformPref = {
        twitch: Boolean(pref.twitch),
        youtube: Boolean(pref.youtube),
      };
      if (platTwitch) {
        platTwitch.dataset.state = platformPref.twitch ? 'armed' : 'off';
        platTwitch.setAttribute('aria-pressed', platformPref.twitch ? 'true' : 'false');
      }
      if (platYoutube) {
        platYoutube.dataset.state = platformPref.youtube ? 'armed' : 'off';
        platYoutube.setAttribute('aria-pressed', platformPref.youtube ? 'true' : 'false');
      }
      syncPlatformHint(platformPref);
    }

    function persistPlatformPref(pref, options) {
      var opts = options || {};
      applyPlatformChips(pref);
      try {
        localStorage.setItem(PLATFORM_PREF_KEY, JSON.stringify(platformPref));
      } catch (_err) {
        /* ignore */
      }
      var last = primaryPlatformFromPref(platformPref);
      if (!opts.skipSettings) {
        if (global.MakaStudioSettings && typeof global.MakaStudioSettings.setSettings === 'function') {
          global.MakaStudioSettings.setSettings({ lastStreamPlatform: last });
        } else {
          try {
            var raw = localStorage.getItem('maka.stream.settings.v1');
            var base = raw ? JSON.parse(raw) : {};
            if (!base || typeof base !== 'object') base = {};
            base.lastStreamPlatform = last;
            localStorage.setItem('maka.stream.settings.v1', JSON.stringify(base));
          } catch (_err2) {
            /* ignore */
          }
          var select = doc.getElementById('set-last-platform');
          if (select) select.value = last;
        }
      }
      window.dispatchEvent(
        new CustomEvent('maka:platform-pref-change', {
          detail: { twitch: platformPref.twitch, youtube: platformPref.youtube, lastStreamPlatform: last },
        }),
      );
    }

    function togglePlatform(name) {
      if (name !== 'twitch' && name !== 'youtube') return;
      lastPlatformClick = name;
      var next = { twitch: platformPref.twitch, youtube: platformPref.youtube };
      next[name] = !next[name];
      persistPlatformPref(next);
      log(
        (next[name] ? 'Selected ' : 'Cleared ') +
          (name === 'twitch' ? 'Twitch' : 'YouTube') +
          ' destination preference.',
      );
    }

    function onSettingsPlatformSync(ev) {
      var detail = (ev && ev.detail) || {};
      var last = detail.lastStreamPlatform;
      if (last !== 'twitch' && last !== 'youtube' && last !== 'none') return;
      // When settings dropdown changes, treat as exclusive selection.
      var next = {
        twitch: last === 'twitch',
        youtube: last === 'youtube',
      };
      lastPlatformClick = last === 'youtube' ? 'youtube' : last === 'twitch' ? 'twitch' : 'none';
      applyPlatformChips(next);
      try {
        localStorage.setItem(PLATFORM_PREF_KEY, JSON.stringify(next));
      } catch (_err) {
        /* ignore */
      }
    }

    if (btnRecording) {
      btnRecording.addEventListener('click', function () {
        void (async function () {
          if (recordingActive) await stopRecordingAndSave();
          else await startRecording();
        })();
      });
    }
    if (btnVcam) {
      btnVcam.addEventListener('click', function () {
        toggleVcam();
      });
    }
    if (platTwitch) {
      platTwitch.addEventListener('click', function () {
        togglePlatform('twitch');
      });
    }
    if (platYoutube) {
      platYoutube.addEventListener('click', function () {
        togglePlatform('youtube');
      });
    }
    window.addEventListener('maka:settings-platform-sync', onSettingsPlatformSync);

    applyPlatformChips(readPlatformPref());
    setRecordingUi(false);
    setVcamUi(false);
    syncRecordingAvailability();

    // --- Capture fallback (when preview module not owning the canvas) ---
    if (ownsCapture) {
      if (els.btnWebcam) {
        els.btnWebcam.addEventListener('click', function () {
          void (async function () {
            stopMedia(webcamStream);
            webcamStream = null;
            try {
              webcamStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
              log('Webcam added.');
            } catch (err) {
              log('Webcam denied: ' + (err instanceof Error ? err.message : err));
            }
            updateButtons();
          })();
        });
      }
      if (els.btnScreen) {
        els.btnScreen.addEventListener('click', function () {
          void (async function () {
            stopMedia(screenStream);
            screenStream = null;
            try {
              screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
              });
              screenStream.getVideoTracks()[0].onended = function () {
                screenStream = null;
                updateButtons();
              };
              log('Screen share added.');
            } catch (err) {
              log('Screen share denied: ' + (err instanceof Error ? err.message : err));
            }
            updateButtons();
          })();
        });
      }
      if (els.btnMic) {
        els.btnMic.addEventListener('click', function () {
          void (async function () {
            stopMedia(micStream);
            micStream = null;
            try {
              micStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              log('Microphone added.');
              if (global.MakaStreamAudio && typeof global.MakaStreamAudio.setStream === 'function') {
                try {
                  global.MakaStreamAudio.setStream('mic', micStream);
                } catch (_err) {
                  /* optional bus */
                }
              }
            } catch (err) {
              log('Mic denied: ' + (err instanceof Error ? err.message : err));
            }
            updateButtons();
          })();
        });
      }
      drawFrame();
    }

    function bindGoLive(btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        void onGoLive();
      });
    }
    bindGoLive(els.btnGoLive);
    bindGoLive(els.btnGoLiveSidebar);

    if (els.btnRelayRefresh) {
      els.btnRelayRefresh.addEventListener('click', function () {
        void probeRelay();
      });
    }
    if (els.modalClose) {
      els.modalClose.addEventListener('click', function () {
        if (els.modal) els.modal.hidden = true;
      });
    }
    if (els.modal) {
      els.modal.addEventListener('click', function (e) {
        if (e.target === els.modal) els.modal.hidden = true;
      });
    }

    window.addEventListener('maka:preview-change', onPreviewChange);
    document.addEventListener('maka:preview-change', onPreviewChange);
    window.addEventListener('resize', resizeCanvas);

    updateButtons();
    setLiveUi(false);
    void probeRelay({ quiet: !isPageLocalhost() }).then(function (ok) {
      if (!ok && isPageLocalhost()) {
        log('Local page — start a mock relay or desktop Maka to enable WHIP.');
      }
    });
    log(
      'Web studio — probes 127.0.0.1:' +
        RELAY_PORT +
        '/health (local sidecar only). Go Live publishes WHIP when relay + preview are ready.',
    );

    var api = {
      probeRelay: probeRelay,
      goLive: onGoLive,
      endLive: onEndLive,
      isLive: function () {
        return Boolean(whipPublisher);
      },
      isRelayDetected: function () {
        return relayDetected;
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        stopStatusPoll();
        if (durationTimer) clearInterval(durationTimer);
        stopVcamLoop();
        if (recordingActive && mediaRecorder) {
          try {
            mediaRecorder.stop();
          } catch (_err) {
            /* ignore */
          }
          mediaRecorder = null;
          recordingActive = false;
        }
        window.removeEventListener('maka:preview-change', onPreviewChange);
        document.removeEventListener('maka:preview-change', onPreviewChange);
        window.removeEventListener('resize', resizeCanvas);
        window.removeEventListener('maka:settings-platform-sync', onSettingsPlatformSync);
        if (whipPublisher) {
          void whipPublisher.close();
          whipPublisher = null;
        }
        stopMedia(screenStream);
        stopMedia(webcamStream);
        stopMedia(micStream);
        screenStream = webcamStream = micStream = null;
      },
    };

    global.MakaLive = api;
    global.__makaLiveApi = api;
    return api;
  }

  global.initLive = initLive;

  // Classic <script defer> auto-boot when Go Live chrome is present.
  function autoBoot() {
    if (document.getElementById('btn-go-live') || document.getElementById('btn-go-live-sidebar')) {
      initLive(document);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBoot);
  } else {
    autoBoot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initLive: initLive };
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);

// Loaded as <script type="module"> from index.html
export function initLive(root) {
  return globalThis.initLive(root);
}
