/**
 * OWNER: web-studio-port / Go Live controls
 * site/stream/js/live.js — do not replace with a stub.
 *
 * Web studio Go Live / relay / WHIP controls.
 *
 * Desktop (exe) spawns MAKArelay as a sidecar and polls
 * http://127.0.0.1:38473/health via the main process. The web client cannot
 * start that process — it only probes the same local endpoints from the
 * browser. A CDN /relay proxy is staging-only and is never treated as the
 * user's encoder (keys stay on the streamer's PC).
 *
 * Contract: src/shared (relay contracts), src/renderer/relay-client.ts, src/renderer/whip.ts
 * Preview handoff (same instance): #studio-preview._makaPreview |
 * window.MakaStreamPreview (canonical) | window.MakaPreview (alias).
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
  var DEST_STORAGE_KEY = 'maka.stream.destinations.v1';
  /** Matches exe settings-store + Settings / stats bar default. */
  var DEFAULT_BITRATE_PROFILE = '720p30';
  var DEFAULT_STREAM_GAME = 'Just Chatting';
  var SHARED_KEYS = {
    streamTitle: 'maka.stream.streamTitle',
    streamGame: 'maka.stream.streamGame',
    streamCategoryLegacy: 'maka.stream.streamCategory',
    bitrateProfile: 'maka.stream.bitrateProfile',
  };
  /** Mirror src/shared/stream-encode-profiles.ts — relay `profile` + bitrateMbps. */
  var ENCODE_PROFILE_MAP = {
    '720p30': { bitrateMbps: 3 },
    '720p60': { bitrateMbps: 4.5 },
    '1080p30': { bitrateMbps: 4.5 },
    '1080p60': { bitrateMbps: 6 },
    '2k60': { bitrateMbps: 10 },
    '4k60': { bitrateMbps: 16 },
  };

  function resolveRelayCandidates() {
    var params = new URLSearchParams(window.location.search);
    var relayParam = (params.get('relay') || '').trim().replace(/\/$/, '');
    if (relayParam) return [relayParam];
    // Droplet hosts the relay at same-origin /relay. Localhost is only a fallback
    // when this page itself is opened on the relay machine.
    var list = [];
    try {
      if (window.location && window.location.origin && window.location.protocol !== 'file:') {
        list.push(String(window.location.origin).replace(/\/$/, '') + '/relay');
      }
    } catch (_err) {
      /* ignore */
    }
    list.push('http://127.0.0.1:' + RELAY_PORT);
    list.push('http://localhost:' + RELAY_PORT);
    return list;
  }

  function isLoopbackRelayBase(base) {
    try {
      var u = new URL(base, window.location.href);
      return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    } catch (_err) {
      return /127\.0\.0\.1|localhost/i.test(String(base || ''));
    }
  }

  /** Hosted /relay on this site, loopback, or an explicit ?relay= override. */
  function isPublishableRelayBase(base) {
    var params = new URLSearchParams(window.location.search);
    if ((params.get('relay') || '').trim()) return true;
    if (isLoopbackRelayBase(base)) return true;
    try {
      var u = new URL(base, window.location.href);
      var origin = String(window.location.origin || '').replace(/\/$/, '');
      return u.origin === origin && /\/relay$/i.test(u.pathname.replace(/\/$/, '') || '/relay');
    } catch (_err) {
      return /\/relay$/i.test(String(base || ''));
    }
  }

  function sanitizeTitle(raw) {
    return String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 140);
  }

  function sanitizeGame(raw) {
    var cleaned = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 100);
    return cleaned || DEFAULT_STREAM_GAME;
  }

  function extractStreamKey(raw) {
    var key = String(raw || '').trim();
    var fromUrl = key.match(/rtmps?:\/\/[^/\s]+\/(?:app|live2)\/([^/?#\s]+)/i);
    if (fromUrl && fromUrl[1]) return fromUrl[1];
    var fromApp = key.match(/\/(?:app|live2)\/([^/?#\s]+)/i);
    if (fromApp && fromApp[1]) return fromApp[1];
    return key;
  }

  function isTwitchStreamKey(raw) {
    var key = extractStreamKey(raw);
    if (!key || /\s/.test(key)) return false;
    if (key.length < 15 || key.length > 128) return false;
    return /^live_[a-zA-Z0-9_]+$/.test(key);
  }

  function isYouTubeStreamKey(raw) {
    var key = extractStreamKey(raw);
    if (!key || /\s/.test(key)) return false;
    return /^[a-z0-9]{4}(?:-[a-z0-9]{4}){3,5}$/i.test(key);
  }

  function streamKeyValid(platform, raw) {
    return platform === 'youtube' ? isYouTubeStreamKey(raw) : isTwitchStreamKey(raw);
  }

  function writeMetaField(el, value, emptyFallback) {
    if (!el) return;
    var shown = String(value || '').trim() || emptyFallback || '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (document.activeElement !== el) el.value = String(value || '').trim();
      return;
    }
    el.textContent = shown;
  }

  function migrateGameStorage() {
    try {
      var game = localStorage.getItem(SHARED_KEYS.streamGame);
      if (game != null && String(game).length) {
        localStorage.setItem(SHARED_KEYS.streamGame, sanitizeGame(game));
        return;
      }
      var legacy = localStorage.getItem(SHARED_KEYS.streamCategoryLegacy);
      if (legacy != null) {
        localStorage.setItem(SHARED_KEYS.streamGame, sanitizeGame(legacy));
        localStorage.removeItem(SHARED_KEYS.streamCategoryLegacy);
      } else if (localStorage.getItem(SHARED_KEYS.streamGame) == null) {
        localStorage.setItem(SHARED_KEYS.streamGame, DEFAULT_STREAM_GAME);
      }
    } catch (_err) {
      /* private mode */
    }
  }

  function readStoredGame() {
    migrateGameStorage();
    try {
      var game = localStorage.getItem(SHARED_KEYS.streamGame);
      if (game == null) {
        var legacy = localStorage.getItem(SHARED_KEYS.streamCategoryLegacy);
        if (legacy != null) return sanitizeGame(legacy);
      }
      return sanitizeGame(game);
    } catch (_err) {
      return DEFAULT_STREAM_GAME;
    }
  }

  function readStoredTitle() {
    try {
      return sanitizeTitle(localStorage.getItem(SHARED_KEYS.streamTitle));
    } catch (_err) {
      return '';
    }
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
      // Single primary CTA: Stream Controls → Go Live (header Go Live removed).
      btnGoLive: doc.getElementById('btn-go-live-sidebar') || doc.getElementById('btn-go-live'),
      btnGoLiveSidebar: doc.getElementById('btn-go-live-sidebar'),
      btnGoLiveLabel: doc.getElementById('btn-go-live-label'),
      btnRelayRefresh: doc.getElementById('btn-relay-refresh'),
      streamTitle: doc.getElementById('stream-title-input'),
      streamGame: doc.getElementById('stream-game-input'),
      livePill: doc.getElementById('stream-live-pill'),
      streamDuration: doc.getElementById('stream-duration'),
      streamViewers: doc.getElementById('stream-viewers'),
      cfgProfile: doc.getElementById('cfg-profile'),
      modal: doc.getElementById('relay-modal'),
      modalClose: doc.getElementById('modal-close'),
      modalBody: doc.getElementById('modal-body'),
      modalTitle: doc.getElementById('modal-title'),
      previewHost: doc.getElementById('studio-preview'),
      keyModal: doc.getElementById('stream-key-modal'),
      keyModalTitle: doc.getElementById('stream-key-modal-title'),
      keyModalLede: doc.getElementById('stream-key-modal-lede'),
      keyModalArm: doc.getElementById('stream-key-modal-arm'),
      keyModalArmLabel: doc.getElementById('stream-key-modal-arm-label'),
      keyModalSave: doc.getElementById('stream-key-modal-save'),
      keyModalCancel: doc.getElementById('stream-key-modal-cancel'),
      keyIngestHint: doc.getElementById('stream-key-ingest-hint'),
      wizardDialog: doc.getElementById('go-live-wizard-dialog'),
      wizardStep: doc.getElementById('go-live-wizard-step'),
      wizardTitle: doc.getElementById('go-live-wizard-title'),
      wizardBody: doc.getElementById('go-live-wizard-body'),
      wizardPanelPlatform: doc.getElementById('go-live-wizard-panel-platform'),
      wizardPanelKey: doc.getElementById('go-live-wizard-panel-key'),
      wizardPanelDetails: doc.getElementById('go-live-wizard-panel-details'),
      wizardPanelGo: doc.getElementById('go-live-wizard-panel-go'),
      wizardTitleInput: doc.getElementById('go-live-wizard-title-input'),
      wizardGameInput: doc.getElementById('go-live-wizard-game-input'),
      wizardQuality: doc.getElementById('go-live-wizard-quality'),
      wizardGoStatus: doc.getElementById('go-live-wizard-go-status'),
      wizardTwitchKey: doc.getElementById('wizard-twitch-key'),
      wizardYoutubeKey: doc.getElementById('wizard-youtube-key'),
      wizardNext: doc.getElementById('go-live-wizard-next'),
      wizardBack: doc.getElementById('go-live-wizard-back'),
      wizardCancel: doc.getElementById('go-live-wizard-cancel'),
    };

    // Need at least Go Live chrome or a canvas to own this page slice.
    if (!els.btnGoLive && !els.btnGoLiveSidebar && !els.canvas && !els.statusText) {
      return null;
    }

    var goLiveBusy = false;
    var keyModalPlatform = 'twitch';

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

    function relaySource() {
      return {
        detected: Boolean(relayDetected),
        version: relayHealth && relayHealth.version ? String(relayHealth.version) : null,
        host: relayDetected && relayBase ? relayBase : null,
      };
    }

    function publishRelaySource() {
      window.dispatchEvent(new CustomEvent('maka:relay-source', { detail: relaySource() }));
    }

    function setRelayChrome(state) {
      var connected = Boolean(relayDetected);
      var text = connected ? 'Relay connected' : 'Relay not detected';
      if (els.statusDot) els.statusDot.dataset.state = connected ? (state === 'live' ? 'live' : 'ok') : 'warn';
      if (els.statusText) els.statusText.textContent = text;
      var chip = document.getElementById('relay-chip');
      if (chip) {
        chip.dataset.state = !connected ? 'stopped' : state === 'live' ? 'live' : 'ready';
      }
      publishRelaySource();
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

    function syncProgramLiveChrome(isLive) {
      // Toggle .is-live on program stage chrome so CSS can flash “Live Output” when WHIP is up.
      var live = Boolean(isLive);
      var program = doc.getElementById('program');
      if (program) program.classList.toggle('is-live', live);
      var host = els.previewHost || doc.getElementById('studio-preview');
      if (host) {
        var stage = host.querySelector('.preview-stage');
        if (stage) stage.classList.toggle('is-live', live);
        var labels = host.querySelectorAll('.program-label, .preview-stage__label');
        for (var i = 0; i < labels.length; i++) {
          labels[i].classList.toggle('is-live', live);
        }
        var scenePill = host.querySelector('.preview-stage__scene-name');
        if (scenePill) scenePill.classList.toggle('is-live', live);
      }
      if (els.livePill) els.livePill.classList.toggle('is-live', live);
    }

    function setLiveUi(isLive) {
      if (els.livePill) {
        els.livePill.dataset.live = isLive ? 'true' : 'false';
        els.livePill.textContent = isLive ? 'Live' : 'Offline';
      }
      if (els.btnGoLiveLabel) {
        els.btnGoLiveLabel.textContent = isLive ? 'End Live' : 'Go Live';
      } else if (els.btnGoLive && !els.btnGoLiveLabel) {
        els.btnGoLive.textContent = isLive ? 'End Live' : 'Go Live';
      }
      if (els.btnGoLive) els.btnGoLive.dataset.live = isLive ? '1' : '0';
      if (els.btnGoLiveSidebar && els.btnGoLiveSidebar !== els.btnGoLive) {
        els.btnGoLiveSidebar.dataset.live = isLive ? '1' : '0';
      }
      if (els.streamViewers) {
        els.streamViewers.textContent = isLive ? 'Local relay' : '—';
        els.streamViewers.title = isLive
          ? 'Publishing WHIP to the local sidecar — not a CDN viewer count'
          : 'Viewer count only appears after a real platform ingest';
      }
      syncProgramLiveChrome(isLive);
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
      // Shared getter for Go Live / WHIP and Recording.
      if (els.previewHost && els.previewHost._makaPreview) return els.previewHost._makaPreview;
      if (global.MakaStreamPreview) return global.MakaStreamPreview;
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
      // Keep Go Live clickable so missing capture/relay show an honest modal (never a silent no-op).
      var disable = goLiveBusy;
      if (els.btnGoLive) {
        els.btnGoLive.disabled = disable;
        els.btnGoLive.title = live
          ? 'End WHIP session'
          : hasCapture()
            ? 'Publish WHIP to local relay (keys from Twitch/YouTube chips → /config)'
            : 'Go Live — share a tab/window or add a webcam first (click for details)';
      }
      if (els.btnGoLiveSidebar && els.btnGoLiveSidebar !== els.btnGoLive) {
        els.btnGoLiveSidebar.disabled = disable;
        els.btnGoLiveSidebar.title = els.btnGoLive ? els.btnGoLive.title : '';
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
          if (!isPublishableRelayBase(hit.base)) continue;
          relayBase = hit.base;
          relayHealth = hit.health;
          relayDetected = true;
          var version = hit.health.version || '?';
          setRelayChrome('ok');
          if (!quiet) log('Relay connected at ' + relayBase + ' (v' + version + ').');
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
      setRelayChrome('warn');
      if (!quiet) {
        var reason =
          lastError instanceof Error ? lastError.message : String(lastError || 'unreachable');
        log('Relay not detected (' + reason + ').');
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
          setRelayChrome('live');
        } else if (relayDetected) {
          setRelayChrome('ok');
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

    function readBitrateProfile() {
      var fromStorage = '';
      try {
        fromStorage = localStorage.getItem(SHARED_KEYS.bitrateProfile) || '';
      } catch (_err) {
        /* ignore */
      }
      var fromCfg = els.cfgProfile && els.cfgProfile.value;
      var fromQuality = doc.getElementById('program-quality-select');
      var fromSelect = fromQuality && fromQuality.value;
      var fromWizard = els.wizardQuality && els.wizardQuality.value;
      // Prefer persisted shared key so Settings / Stream Info / wizard / stats bar stay aligned.
      var raw = fromStorage || fromCfg || fromSelect || fromWizard || DEFAULT_BITRATE_PROFILE;
      if (!ENCODE_PROFILE_MAP[raw]) {
        if (raw === '720p') return '720p30';
        if (raw === '1080p') return '1080p60';
        return DEFAULT_BITRATE_PROFILE;
      }
      return raw;
    }

    function syncEncodeSelects(profile) {
      var id = profile || readBitrateProfile();
      if (!ENCODE_PROFILE_MAP[id]) id = DEFAULT_BITRATE_PROFILE;
      ;[els.cfgProfile, doc.getElementById('program-quality-select'), els.wizardQuality].forEach(
        function (select) {
          if (!select) return;
          if (![...select.options].some(function (o) {
            return o.value === id;
          })) {
            var opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            select.appendChild(opt);
          }
          if (select.tagName === 'SELECT' && document.activeElement !== select) select.value = id;
        },
      );
      var statEncode = doc.getElementById('stat-encode');
      if (statEncode) statEncode.textContent = id;
      try {
        localStorage.setItem(SHARED_KEYS.bitrateProfile, id);
      } catch (_err) {
        /* ignore */
      }
      if (global.MakaStudioSettings && typeof global.MakaStudioSettings.setSettings === 'function') {
        try {
          var cur = global.MakaStudioSettings.getSettings
            ? global.MakaStudioSettings.getSettings()
            : null;
          if (!cur || cur.bitrateProfile !== id) {
            global.MakaStudioSettings.setSettings({ bitrateProfile: id });
          }
        } catch (_err2) {
          /* ignore */
        }
      }
      return id;
    }

    function syncStreamMetaDom(title, game) {
      var t = sanitizeTitle(title);
      var g = sanitizeGame(game);
      writeMetaField(els.streamTitle, t, 'Untitled stream');
      writeMetaField(els.streamGame, g, DEFAULT_STREAM_GAME);
      if (els.wizardTitleInput && document.activeElement !== els.wizardTitleInput) {
        els.wizardTitleInput.value = t;
      }
      if (els.wizardGameInput && document.activeElement !== els.wizardGameInput) {
        els.wizardGameInput.value = g;
      }
      try {
        localStorage.setItem(SHARED_KEYS.streamTitle, t);
        localStorage.setItem(SHARED_KEYS.streamGame, g);
        localStorage.removeItem(SHARED_KEYS.streamCategoryLegacy);
      } catch (_err) {
        /* ignore */
      }
      if (global.MakaStudioSettings && typeof global.MakaStudioSettings.setSettings === 'function') {
        try {
          global.MakaStudioSettings.setSettings({ streamTitle: t, streamGame: g });
        } catch (_err2) {
          /* ignore */
        }
      }
      var setTitle = doc.getElementById('set-stream-title');
      var setGame = doc.getElementById('set-stream-game');
      if (setTitle && document.activeElement !== setTitle) setTitle.value = t;
      if (setGame && document.activeElement !== setGame) setGame.value = g;
    }

    function readDestinations() {
      var out = { destTwitch: false, destYoutube: false, twitchKey: '', youtubeKey: '' };
      if (global.MakaStudioSettings && typeof global.MakaStudioSettings.getDestinations === 'function') {
        try {
          var fromSettings = global.MakaStudioSettings.getDestinations();
          if (fromSettings && typeof fromSettings === 'object') {
            out.destTwitch = Boolean(fromSettings.destTwitch);
            out.destYoutube = Boolean(fromSettings.destYoutube);
            if (typeof fromSettings.twitchKey === 'string') out.twitchKey = fromSettings.twitchKey;
            if (typeof fromSettings.youtubeKey === 'string') out.youtubeKey = fromSettings.youtubeKey;
          }
        } catch (_err) {
          /* fall through */
        }
      }
      try {
        var raw = localStorage.getItem(DEST_STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (typeof parsed.destTwitch === 'boolean') out.destTwitch = parsed.destTwitch;
            if (typeof parsed.destYoutube === 'boolean') out.destYoutube = parsed.destYoutube;
            if (typeof parsed.twitchKey === 'string') out.twitchKey = parsed.twitchKey;
            if (typeof parsed.youtubeKey === 'string') out.youtubeKey = parsed.youtubeKey;
          }
        }
      } catch (_err2) {
        /* ignore */
      }
      var twitchInput = doc.getElementById('web-twitch-key');
      var youtubeInput = doc.getElementById('web-youtube-key');
      if (twitchInput && twitchInput.value) out.twitchKey = String(twitchInput.value).trim();
      if (youtubeInput && youtubeInput.value) out.youtubeKey = String(youtubeInput.value).trim();
      return out;
    }

    function persistDestinations(partial) {
      var next = Object.assign(readDestinations(), partial || {});
      try {
        localStorage.setItem(DEST_STORAGE_KEY, JSON.stringify(next));
      } catch (_err) {
        /* ignore */
      }
      if (global.MakaStudioSettings && typeof global.MakaStudioSettings.setDestinations === 'function') {
        try {
          global.MakaStudioSettings.setDestinations(next);
        } catch (_err2) {
          /* ignore */
        }
      }
      var twitchInput = doc.getElementById('web-twitch-key');
      var youtubeInput = doc.getElementById('web-youtube-key');
      if (twitchInput && document.activeElement !== twitchInput) twitchInput.value = next.twitchKey || '';
      if (youtubeInput && document.activeElement !== youtubeInput) {
        youtubeInput.value = next.youtubeKey || '';
      }
      return next;
    }

    function readStudioAudioVideoPrefs() {
      var prefs = {
        audioMicBitrateKbps: 160,
        audioDesktopBitrateKbps: 160,
        videoEncoderPreference: 'system',
        gpuPreference: 'default',
      };
      try {
        if (global.MakaStudioSettings && typeof global.MakaStudioSettings.getSettings === 'function') {
          var s = global.MakaStudioSettings.getSettings();
          if (s) {
            if (Number.isFinite(s.audioMicBitrateKbps)) prefs.audioMicBitrateKbps = s.audioMicBitrateKbps;
            if (Number.isFinite(s.audioDesktopBitrateKbps)) {
              prefs.audioDesktopBitrateKbps = s.audioDesktopBitrateKbps;
            }
            if (s.videoEncoderPreference) prefs.videoEncoderPreference = s.videoEncoderPreference;
            if (s.gpuPreference) prefs.gpuPreference = s.gpuPreference;
          }
        }
      } catch (_err) {
        /* ignore */
      }
      return prefs;
    }

    function buildRelayConfigBody() {
      var profile = readBitrateProfile();
      var spec = ENCODE_PROFILE_MAP[profile] || ENCODE_PROFILE_MAP[DEFAULT_BITRATE_PROFILE];
      var body = {
        profile: profile,
        bitrateMbps: spec.bitrateMbps,
      };
      var title =
        sanitizeTitle((els.wizardTitleInput && els.wizardTitleInput.value) || readStoredTitle());
      var game =
        sanitizeGame((els.wizardGameInput && els.wizardGameInput.value) || '') || readStoredGame();
      // Relay /config still uses streamCategory; UI + localStorage use Game.
      if (title) body.streamTitle = title;
      if (game) body.streamCategory = game;

      var dest = readDestinations();
      var platform = wizardPlatform === 'youtube' ? 'youtube' : 'twitch';
      body.platform = platform;
      if (platform === 'twitch') {
        var twitchRaw =
          (els.wizardTwitchKey && String(els.wizardTwitchKey.value || '').trim()) || dest.twitchKey || '';
        body.twitchKey = extractStreamKey(twitchRaw);
        body.youtubeKey = '';
      } else {
        var youtubeRaw =
          (els.wizardYoutubeKey && String(els.wizardYoutubeKey.value || '').trim()) ||
          dest.youtubeKey ||
          '';
        body.youtubeKey = extractStreamKey(youtubeRaw);
        body.twitchKey = '';
      }

      var prefs = readStudioAudioVideoPrefs();
      body.audioMicBitrateKbps = prefs.audioMicBitrateKbps;
      body.audioDesktopBitrateKbps = prefs.audioDesktopBitrateKbps;
      body.videoEncoderPreference = prefs.videoEncoderPreference;
      if (prefs.gpuPreference) body.gpuPreference = prefs.gpuPreference;
      return body;
    }

    async function postRelayConfig() {
      if (!relayHealth) throw new Error('Relay not connected');
      var body = buildRelayConfigBody();
      syncEncodeSelects(body.profile);
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
      var keyBits = [];
      if (body.twitchKey) keyBits.push('twitchKey');
      if (body.youtubeKey) keyBits.push('youtubeKey');
      log(
        'POST /config applied (profile=' +
          body.profile +
          ' @ ' +
          body.bitrateMbps +
          ' Mbps' +
          (body.streamTitle ? ', title' : '') +
          (body.streamCategory ? ', game' : '') +
          (keyBits.length ? ', ' + keyBits.join('+') : ', keys via relay settings if unset') +
          ' → relay RAM).',
      );
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

    function showRelayModal(message, title) {
      if (els.modalTitle && title) els.modalTitle.textContent = title;
      else if (els.modalTitle && !title) {
        els.modalTitle.textContent = 'Local relay required for go-live';
      }
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

    var wizardStep = 'platform';
    var wizardPlatform = 'twitch';
    var wizardBusy = false;

    function populateWizardQualitySelect() {
      if (!els.wizardQuality) return;
      var current = readBitrateProfile();
      if (els.wizardQuality.options.length === 0) {
        Object.keys(ENCODE_PROFILE_MAP).forEach(function (id) {
          var opt = document.createElement('option');
          opt.value = id;
          var mbps = ENCODE_PROFILE_MAP[id].bitrateMbps;
          opt.textContent = id + ' · ' + mbps + ' Mbps';
          els.wizardQuality.appendChild(opt);
        });
      }
      els.wizardQuality.value = current;
    }

    function closeGoLiveWizard() {
      if (els.wizardDialog && els.wizardDialog.open) {
        try {
          els.wizardDialog.close();
        } catch (_err) {
          els.wizardDialog.removeAttribute('open');
        }
      }
      wizardBusy = false;
    }

    function syncWizardKeyPanel() {
      var twitchBlock = els.wizardPanelKey && els.wizardPanelKey.querySelector('[data-wizard-key="twitch"]');
      var youtubeBlock =
        els.wizardPanelKey && els.wizardPanelKey.querySelector('[data-wizard-key="youtube"]');
      if (twitchBlock) twitchBlock.hidden = wizardPlatform !== 'twitch';
      if (youtubeBlock) youtubeBlock.hidden = wizardPlatform !== 'youtube';
    }

    function paintPlatformPicks() {
      var twitchBtn = doc.getElementById('wizard-platform-twitch');
      var youtubeBtn = doc.getElementById('wizard-platform-youtube');
      if (twitchBtn) twitchBtn.setAttribute('aria-pressed', wizardPlatform === 'twitch' ? 'true' : 'false');
      if (youtubeBtn) youtubeBtn.setAttribute('aria-pressed', wizardPlatform === 'youtube' ? 'true' : 'false');
    }

    function activeWizardKeyValue() {
      var input = wizardPlatform === 'youtube' ? els.wizardYoutubeKey : els.wizardTwitchKey;
      return input ? String(input.value || '').trim() : '';
    }

    function refreshKeyGate() {
      var hint = doc.getElementById('wizard-key-hint');
      var value = activeWizardKeyValue();
      var ok = streamKeyValid(wizardPlatform, value);
      if (wizardStep === 'key' && els.wizardNext) els.wizardNext.disabled = wizardBusy || !ok;
      if (!hint) return;
      if (wizardStep !== 'key' || !value || ok) {
        hint.hidden = true;
        hint.textContent = '';
        return;
      }
      hint.hidden = false;
      hint.textContent =
        wizardPlatform === 'youtube'
          ? 'That doesn’t match a YouTube stream key (abcd-efgh-ijkl-mnop).'
          : 'That doesn’t match a Twitch stream key (live_…).';
    }

    function renderGoLiveWizard() {
      if (els.wizardDialog) els.wizardDialog.dataset.step = wizardStep;
      if (els.wizardPanelPlatform) els.wizardPanelPlatform.hidden = wizardStep !== 'platform';
      if (els.wizardPanelKey) els.wizardPanelKey.hidden = wizardStep !== 'key';
      if (els.wizardPanelDetails) els.wizardPanelDetails.hidden = wizardStep !== 'details';
      if (els.wizardPanelGo) els.wizardPanelGo.hidden = wizardStep !== 'go';
      paintPlatformPicks();

      var steps = ['platform', 'key', 'details', 'go'];
      var idx = steps.indexOf(wizardStep);
      if (els.wizardStep) els.wizardStep.textContent = 'Step ' + (idx + 1) + ' of ' + steps.length;

      if (els.wizardBack) els.wizardBack.hidden = wizardStep === 'platform';
      if (els.wizardNext) {
        els.wizardNext.disabled = wizardBusy;
        if (wizardStep === 'go') els.wizardNext.textContent = wizardBusy ? 'Going live…' : 'Go Live';
        else els.wizardNext.textContent = 'Next';
      }

      if (wizardStep === 'platform') {
        if (els.wizardTitle) els.wizardTitle.textContent = 'Choose a platform';
        if (els.wizardBody) els.wizardBody.textContent = 'Which platform would you like to stream to?';
      } else if (wizardStep === 'key') {
        if (els.wizardTitle) els.wizardTitle.textContent = 'Stream key';
        if (els.wizardBody) els.wizardBody.textContent = 'Enter your stream key';
        syncWizardKeyPanel();
        refreshKeyGate();
      } else if (wizardStep === 'details') {
        if (els.wizardTitle) els.wizardTitle.textContent = 'Stream info';
        if (els.wizardBody) els.wizardBody.textContent = '';
        populateWizardQualitySelect();
      } else if (els.wizardGoStatus) {
        els.wizardGoStatus.textContent = '';
      }
    }

    function applyWizardPlatform(platform) {
      wizardPlatform = platform === 'youtube' ? 'youtube' : 'twitch';
      lastPlatformClick = wizardPlatform;
      var next = {
        twitch: wizardPlatform === 'twitch',
        youtube: wizardPlatform === 'youtube',
      };
      persistPlatformPref(next);
    }

    function applyWizardKeys() {
      var partial = {};
      if (wizardPlatform === 'twitch') {
        partial.twitchKey = els.wizardTwitchKey
          ? extractStreamKey(els.wizardTwitchKey.value).slice(0, 256)
          : '';
        partial.destTwitch = true;
      } else {
        partial.youtubeKey = els.wizardYoutubeKey
          ? extractStreamKey(els.wizardYoutubeKey.value).slice(0, 256)
          : '';
        partial.destYoutube = true;
      }
      persistDestinations(partial);
    }

    function applyWizardDetails() {
      var title = sanitizeTitle(els.wizardTitleInput && els.wizardTitleInput.value);
      var game = sanitizeGame(els.wizardGameInput && els.wizardGameInput.value);
      var profile = (els.wizardQuality && els.wizardQuality.value) || readBitrateProfile();
      syncStreamMetaDom(title, game);
      syncEncodeSelects(profile);
    }

    function openGoLiveWizard() {
      if (destroyed) return;
      if (whipPublisher) {
        void onEndLive();
        return;
      }
      if (!els.wizardDialog) {
        void startGoLive();
        return;
      }
      migrateGameStorage();
      var pref = readPlatformPref();
      if (pref.youtube && !pref.twitch) wizardPlatform = 'youtube';
      else if (pref.twitch) wizardPlatform = 'twitch';
      else {
        var last = 'none';
        try {
          if (global.MakaStudioSettings && typeof global.MakaStudioSettings.getSettings === 'function') {
            last = global.MakaStudioSettings.getSettings().lastStreamPlatform || 'none';
          }
        } catch (_err) {
          /* ignore */
        }
        wizardPlatform = last === 'youtube' ? 'youtube' : 'twitch';
      }
      paintPlatformPicks();
      var dest = readDestinations();
      if (els.wizardTwitchKey) els.wizardTwitchKey.value = dest.twitchKey || '';
      if (els.wizardYoutubeKey) els.wizardYoutubeKey.value = dest.youtubeKey || '';
      populateWizardQualitySelect();
      if (els.wizardTitleInput && document.activeElement !== els.wizardTitleInput) {
        els.wizardTitleInput.value = readStoredTitle();
      }
      if (els.wizardGameInput && document.activeElement !== els.wizardGameInput) {
        els.wizardGameInput.value = readStoredGame();
      }
      syncStreamMetaDom(readStoredTitle(), readStoredGame());
      syncEncodeSelects(readBitrateProfile());
      wizardStep = 'platform';
      wizardBusy = false;
      renderGoLiveWizard();
      try {
        if (typeof els.wizardDialog.showModal === 'function') els.wizardDialog.showModal();
        else els.wizardDialog.setAttribute('open', '');
      } catch (_err2) {
        els.wizardDialog.setAttribute('open', '');
      }
    }

    async function wizardForward() {
      if (wizardBusy) return;
      if (wizardStep === 'platform') {
        applyWizardPlatform(wizardPlatform);
        wizardStep = 'key';
        renderGoLiveWizard();
        return;
      }
      if (wizardStep === 'key') {
        if (!streamKeyValid(wizardPlatform, activeWizardKeyValue())) {
          refreshKeyGate();
          return;
        }
        applyWizardKeys();
        wizardStep = 'details';
        renderGoLiveWizard();
        return;
      }
      if (wizardStep === 'details') {
        applyWizardDetails();
        wizardStep = 'go';
        renderGoLiveWizard();
        return;
      }
      if (wizardStep === 'go') {
        applyWizardDetails();
        wizardBusy = true;
        renderGoLiveWizard();
        try {
          await startGoLive();
          if (whipPublisher) closeGoLiveWizard();
        } finally {
          wizardBusy = false;
          renderGoLiveWizard();
        }
      }
    }

    function wizardBack() {
      if (wizardStep === 'key') wizardStep = 'platform';
      else if (wizardStep === 'details') wizardStep = 'key';
      else if (wizardStep === 'go') wizardStep = 'details';
      renderGoLiveWizard();
    }

    function wireGoLiveWizard() {
      if (!els.wizardDialog || els.wizardDialog.dataset.makaWizardWired === '1') return;
      els.wizardDialog.dataset.makaWizardWired = '1';
      if (els.wizardNext) {
        els.wizardNext.addEventListener('click', function () {
          void wizardForward();
        });
      }
      if (els.wizardBack) {
        els.wizardBack.addEventListener('click', function () {
          wizardBack();
        });
      }
      if (els.wizardCancel) {
        els.wizardCancel.addEventListener('click', function () {
          closeGoLiveWizard();
        });
      }
      ;['wizard-platform-twitch', 'wizard-platform-youtube'].forEach(function (id) {
        var btn = doc.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', function () {
          wizardPlatform = btn.dataset.platform === 'youtube' ? 'youtube' : 'twitch';
          paintPlatformPicks();
          syncWizardKeyPanel();
          refreshKeyGate();
        });
      });
      ;[els.wizardTwitchKey, els.wizardYoutubeKey].forEach(function (input) {
        if (!input) return;
        input.addEventListener('input', function () {
          refreshKeyGate();
        });
      });
      if (els.wizardQuality) {
        els.wizardQuality.addEventListener('change', function () {
          syncEncodeSelects(els.wizardQuality.value);
        });
      }
      window.addEventListener('maka:open-go-live-wizard', function () {
        openGoLiveWizard();
      });
    }

    async function onGoLive() {
      if (destroyed || goLiveBusy) return;
      if (whipPublisher) {
        goLiveBusy = true;
        updateButtons();
        try {
          await onEndLive();
        } finally {
          goLiveBusy = false;
          updateButtons();
        }
        return;
      }
      openGoLiveWizard();
    }

    async function startGoLive() {
      if (destroyed || goLiveBusy) return;
      if (whipPublisher) return;

      goLiveBusy = true;
      updateButtons();
      try {
        if (!hasCapture()) {
          log('Add webcam or screen share first — preview required before WHIP.');
          showRelayModal(
            'No program preview yet. Share a browser tab / window (Game Capture) or add a webcam, then try Go Live again. The browser publishes WHIP from that preview to the local MAKArelay sidecar — without a capture there is nothing to stream.',
            'Preview required before Go Live',
          );
          if (destHint) {
            destHint.textContent = 'Share a tab/window or add a webcam before Go Live.';
          }
          return;
        }

        var ok = await probeRelay();
        if (!ok || !isPublishableRelayBase(relayBase)) {
          showRelayModal(
            'Relay not detected. The stream relay runs on this site — try again once it is up.',
            'Relay not detected',
          );
          if (destHint) {
            destHint.textContent =
              'Relay missing — download / run Maka desktop for encoding offload on port ' +
              RELAY_PORT +
              '.';
          }
          return;
        }

        // Soft gate: armed platforms without keys still go live (keys may live in desktop relay settings).
        var dest = readDestinations();
        if (platformPref.twitch && !dest.twitchKey) {
          log(
            'Twitch armed without a key in this page — open the Twitch chip to paste a key, or use Maka desktop relay settings.',
          );
        }
        if (platformPref.youtube && !dest.youtubeKey) {
          log(
            'YouTube armed without a key in this page — open the YouTube chip to paste a key, or use Maka desktop relay settings.',
          );
        }
        if (!platformPref.twitch && !platformPref.youtube) {
          log(
            'No Twitch/YouTube chip armed — WHIP will still publish to the relay; configure platform keys via the chips (or relay settings) for RTMP out.',
          );
        }

        try {
          var configBody = buildRelayConfigBody();
          if (configBody.platform === 'twitch' && !configBody.twitchKey) {
            showRelayModal(
              'Twitch was selected, but no stream key was sent to the relay. Go back and enter the key again.',
              'Twitch key missing',
            );
            return;
          }
          if (configBody.platform === 'youtube' && !configBody.youtubeKey) {
            showRelayModal(
              'YouTube was selected, but no stream key was sent to the relay. Go back and enter the key again.',
              'YouTube key missing',
            );
            return;
          }
          try {
            await postRelayConfig();
          } catch (cfgErr) {
            var platformLabel = configBody.platform === 'twitch' ? 'Twitch' : 'YouTube';
            showRelayModal(
              'The relay rejected the stream settings, so ' +
                platformLabel +
                ' was not started. ' +
                (cfgErr instanceof Error ? cfgErr.message : String(cfgErr)),
              'Could not configure the relay',
            );
            return;
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
                  '. Relay encodes with your selected profile and RTMPs to platforms only if keys are in relay RAM — not via this website CDN.',
              );
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              setRelayChrome('warn', 'WHIP ' + state, null);
            }
          };
          setRelayChrome(
            'live',
            'Live via local relay',
            'WHIP → local relay encode → platform RTMP when keys are set. Not a CDN “live” badge.',
          );
          log('WHIP active — check relay /status for encode / platform state.');
          await refreshRelayStatus();
        } catch (err) {
          whipPublisher = null;
          log('Go live failed: ' + (err instanceof Error ? err.message : err));
          showRelayModal(
            'Could not publish WHIP to the local relay. Confirm MAKArelay.exe (or a mock relay) is healthy on port ' +
              RELAY_PORT +
              ', then try again. Preview remains local until WHIP succeeds — the browser does not encode 4K NVENC by itself.',
            'Could not go live',
          );
        }
      } finally {
        goLiveBusy = false;
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
    }

    // --- Stream Controls: Recording / platform key modal ---
    var REC_MIME_CANDIDATES = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    var PLATFORM_PREF_KEY = 'maka.stream.platformPref.v1';
    var mediaRecorder = null;
    var recordingChunks = [];
    var recordingActive = false;
    var recordingStartedAt = 0;
    var recordingMix = null;
    var pendingRecordingBlob = null;
    var pendingRecordingName = '';
    var platformPref = { twitch: false, youtube: false };
    var lastPlatformClick = 'none';

    var btnRecording = doc.getElementById('btn-start-recording');
    var btnRecordingLabel = doc.getElementById('btn-recording-label');
    var statRecording = doc.getElementById('stat-recording');
    var platTwitch = doc.getElementById('plat-twitch');
    var platYoutube = doc.getElementById('plat-youtube');
    var destHint = doc.getElementById('stream-destinations-hint');
    var twitchKeyField = doc.getElementById('dest-twitch-field');
    var youtubeKeyField = doc.getElementById('dest-youtube-field');

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

    function liveAudioTracks(stream) {
      if (!stream || typeof stream.getAudioTracks !== 'function') return [];
      return stream.getAudioTracks().filter(function (track) {
        return track && track.readyState === 'live';
      });
    }

    function mixerStream(id) {
      if (!global.MakaStreamAudio || typeof global.MakaStreamAudio.getStream !== 'function') return null;
      try {
        return global.MakaStreamAudio.getStream(id);
      } catch (_err) {
        return null;
      }
    }

    function connectRecordingSource(ctx, dest, stream, channelId) {
      var tracks = liveAudioTracks(stream);
      if (!tracks.length) return false;
      var source = ctx.createMediaStreamSource(new MediaStream(tracks));
      var gain = ctx.createGain();
      var muted = false;
      var gainDb = 0;
      if (channelId && global.MakaStreamAudio) {
        if (typeof global.MakaStreamAudio.isMuted === 'function') {
          muted = global.MakaStreamAudio.isMuted(channelId);
        }
        if (typeof global.MakaStreamAudio.getGainDb === 'function') {
          gainDb = global.MakaStreamAudio.getGainDb(channelId);
        }
      }
      gain.gain.value = muted ? 0 : Math.pow(10, (Number(gainDb) || 0) / 20);
      source.connect(gain);
      gain.connect(dest);
      return true;
    }

    async function buildRecordingStream(videoStream) {
      var out = new MediaStream();
      videoStream.getVideoTracks().forEach(function (track) {
        if (track.readyState === 'live') out.addTrack(track);
      });
      var ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (_err) {
          /* autoplay policy */
        }
      }
      var dest = ctx.createMediaStreamDestination();
      var micOn = connectRecordingSource(ctx, dest, resolveMicStream(), 'mic');
      var desktopOn = connectRecordingSource(ctx, dest, mixerStream('desktop'), 'desktop');
      var gameOn = connectRecordingSource(ctx, dest, mixerStream('game'), 'game');
      if (!micOn && !desktopOn && !gameOn) {
        connectRecordingSource(ctx, dest, videoStream, null);
      }
      var mixed = dest.stream.getAudioTracks()[0];
      if (mixed) out.addTrack(mixed);
      else {
        try {
          await ctx.close();
        } catch (_err) {
          /* ignore */
        }
        ctx = null;
      }
      return { stream: out, ctx: ctx, micOn: micOn };
    }

    function closeRecordingMix() {
      var mix = recordingMix;
      recordingMix = null;
      if (mix && mix.ctx) {
        mix.ctx.close().catch(function () {
          return undefined;
        });
      }
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

    async function writeRecordingBlob(blob, handle, name) {
      if (handle && typeof handle.createWritable === 'function') {
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        log('Recording saved to ' + (handle.name || name));
        if (destHint) destHint.textContent = 'Recording saved.';
        return;
      }
      downloadRecordingBlob(blob);
    }

    function downloadRecordingBlob(blob) {
      var ext = blob.type && blob.type.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
      var profile = readBitrateProfile();
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

    function showRecordingSaveModal(blob, name) {
      pendingRecordingBlob = blob;
      pendingRecordingName = name;
      var modal = doc.getElementById('recording-save-modal');
      var body = doc.getElementById('recording-save-body');
      if (body) body.textContent = 'Choose where to save ' + name + '.';
      if (modal) modal.hidden = false;
    }

    function hideRecordingSaveModal() {
      var modal = doc.getElementById('recording-save-modal');
      if (modal) modal.hidden = true;
      pendingRecordingBlob = null;
      pendingRecordingName = '';
    }

    async function stopRecordingAndSave() {
      if (!mediaRecorder || !recordingActive) return;
      var profile = readBitrateProfile();
      var ts = new Date().toISOString().replace(/[:.]/g, '-');
      var name = 'maka-recording-' + ts + '-' + profile + '.webm';
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
      var durationMs = recordingStartedAt ? Date.now() - recordingStartedAt : 0;
      recordingStartedAt = 0;
      closeRecordingMix();
      syncRecordingAvailability();
      if (blob && blob.size && global.MakaWebmSeek && typeof global.MakaWebmSeek.fixWebmBuffer === 'function') {
        try {
          var fixed = global.MakaWebmSeek.fixWebmBuffer(new Uint8Array(await blob.arrayBuffer()), durationMs);
          blob = new Blob([fixed], { type: blob.type || 'video/webm' });
        } catch (err) {
          log('Could not index the recording for seeking: ' + (err instanceof Error ? err.message : err));
        }
      }
      if (!blob || !blob.size) {
        log('Recording produced no data.');
        if (destHint) destHint.textContent = 'Recording produced no data.';
        return;
      }
      showRecordingSaveModal(blob, name);
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
      closeRecordingMix();
      var mixed;
      try {
        mixed = await buildRecordingStream(stream);
      } catch (err) {
        log('Could not mix microphone into the recording: ' + (err instanceof Error ? err.message : err));
        mixed = { stream: stream, ctx: null, micOn: false };
      }
      recordingMix = mixed;
      try {
        mediaRecorder = mime
          ? new MediaRecorder(mixed.stream, { mimeType: mime, audioBitsPerSecond: 128000 })
          : new MediaRecorder(mixed.stream);
      } catch (err) {
        log('Could not start recorder: ' + (err instanceof Error ? err.message : err));
        mediaRecorder = null;
        closeRecordingMix();
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
        recordingStartedAt = Date.now();
        mediaRecorder.start(1000);
      } catch (err) {
        log('Recorder start failed: ' + (err instanceof Error ? err.message : err));
        mediaRecorder = null;
        recordingStartedAt = 0;
        closeRecordingMix();
        return;
      }
      setRecordingUi(true);
      if (mixed.micOn) {
        log('Recording preview with microphone. Stop to choose where to save.');
      } else {
        log('Recording without a microphone. Pick a mic under Sources so the next take includes it.');
      }
      if (destHint) {
        destHint.textContent = mixed.micOn
          ? 'Recording preview and microphone…'
          : 'Recording preview. No microphone is selected.';
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
      // Stream Info: safe status only — never echo raw keys.
      if (!destHint) return;
      var dest = readDestinations();
      if (!pref.twitch && !pref.youtube) {
        destHint.textContent =
          'No platform selected — click Twitch / YouTube under the preview to save a stream key.';
        return;
      }
      var next = [];
      if (pref.twitch) {
        next.push(dest.twitchKey ? 'Twitch · key saved' : 'Twitch · key needed');
      }
      if (pref.youtube) {
        next.push(dest.youtubeKey ? 'YouTube · key saved' : 'YouTube · key needed');
      }
      destHint.textContent =
        next.join(' · ') +
        '. Keys stay local for relay /config — not shown here.';
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
      persistDestinations({
        destTwitch: platformPref.twitch,
        destYoutube: platformPref.youtube,
      });
      syncPlatformHint(platformPref);
    }

    function closeStreamKeyModal() {
      if (els.keyModal) els.keyModal.hidden = true;
    }

    function openStreamKeyModal(platform) {
      if (platform !== 'twitch' && platform !== 'youtube') return;
      keyModalPlatform = platform;
      lastPlatformClick = platform;
      var dest = readDestinations();
      var twitchInput = doc.getElementById('web-twitch-key');
      var youtubeInput = doc.getElementById('web-youtube-key');
      if (twitchInput && document.activeElement !== twitchInput) {
        twitchInput.value = dest.twitchKey || '';
      }
      if (youtubeInput && document.activeElement !== youtubeInput) {
        youtubeInput.value = dest.youtubeKey || '';
      }
      if (twitchKeyField) twitchKeyField.hidden = platform !== 'twitch';
      if (youtubeKeyField) youtubeKeyField.hidden = platform !== 'youtube';
      if (els.keyModalTitle) {
        els.keyModalTitle.textContent =
          platform === 'twitch' ? 'Twitch Stream Key' : 'YouTube Stream Key';
      }
      if (els.keyModalLede) {
        els.keyModalLede.textContent = 'Save your stream key here for future streams!';
      }
      if (els.keyModal) els.keyModal.hidden = false;
      var focusInput = platform === 'twitch' ? twitchInput : youtubeInput;
      if (focusInput) {
        window.setTimeout(function () {
          try {
            focusInput.focus({ preventScroll: true });
            focusInput.select();
          } catch (_err) {
            try {
              focusInput.focus();
            } catch (_err2) {
              /* ignore */
            }
          }
        }, 0);
      }
    }

    function saveStreamKeyModal() {
      var platform = keyModalPlatform;
      var twitchInput = doc.getElementById('web-twitch-key');
      var youtubeInput = doc.getElementById('web-youtube-key');
      var partial = {};
      var saved = '';
      if (platform === 'twitch') {
        saved = twitchInput ? String(twitchInput.value || '').trim().slice(0, 256) : '';
        partial.twitchKey = saved;
        partial.destTwitch = saved.length > 0;
      } else {
        saved = youtubeInput ? String(youtubeInput.value || '').trim().slice(0, 256) : '';
        partial.youtubeKey = saved;
        partial.destYoutube = saved.length > 0;
      }
      persistDestinations(partial);
      var next = {
        twitch: platform === 'twitch' ? saved.length > 0 : platformPref.twitch,
        youtube: platform === 'youtube' ? saved.length > 0 : platformPref.youtube,
      };
      persistPlatformPref(next);
      closeStreamKeyModal();
      log(
        (platform === 'twitch' ? 'Twitch' : 'YouTube') +
          (saved.length ? ' stream key saved.' : ' stream key cleared.'),
      );
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

    function wireStreamKeyModal() {
      if (els.keyModalSave) {
        els.keyModalSave.addEventListener('click', function () {
          saveStreamKeyModal();
        });
      }
      if (els.keyModalCancel) {
        els.keyModalCancel.addEventListener('click', function () {
          closeStreamKeyModal();
        });
      }
      if (els.keyModal) {
        els.keyModal.addEventListener('click', function (e) {
          if (e.target === els.keyModal) closeStreamKeyModal();
        });
      }
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && els.keyModal && !els.keyModal.hidden) {
          closeStreamKeyModal();
        }
      });
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
    var recordingChoose = doc.getElementById('recording-save-choose');
    var recordingDownload = doc.getElementById('recording-save-download');
    if (recordingChoose) {
      recordingChoose.addEventListener('click', function () {
        void (async function () {
          var blob = pendingRecordingBlob;
          var name = pendingRecordingName;
          if (!blob) return;
          if (typeof window.showSaveFilePicker !== 'function') {
            downloadRecordingBlob(blob);
            hideRecordingSaveModal();
            return;
          }
          try {
            var handle = await window.showSaveFilePicker({
              suggestedName: name,
              types: [{ description: 'WebM video', accept: { 'video/webm': ['.webm'] } }],
            });
            await writeRecordingBlob(blob, handle, name);
            hideRecordingSaveModal();
          } catch (err) {
            if (err && err.name === 'AbortError') return;
            log('Could not open the save dialog. Use Download instead.');
          }
        })();
      });
    }
    if (recordingDownload) {
      recordingDownload.addEventListener('click', function () {
        if (!pendingRecordingBlob) return;
        downloadRecordingBlob(pendingRecordingBlob);
        hideRecordingSaveModal();
      });
    }
    if (platTwitch) {
      platTwitch.addEventListener('click', function () {
        openStreamKeyModal('twitch');
      });
    }
    if (platYoutube) {
      platYoutube.addEventListener('click', function () {
        openStreamKeyModal('youtube');
      });
    }
    window.addEventListener('maka:settings-platform-sync', onSettingsPlatformSync);
    wireStreamKeyModal();

    applyPlatformChips(readPlatformPref());
    setRecordingUi(false);
    syncRecordingAvailability();
    wireGoLiveWizard();

    (function syncSharedMetaOnBoot() {
      migrateGameStorage();
      syncEncodeSelects(readBitrateProfile());
      syncStreamMetaDom(readStoredTitle(), readStoredGame());
    })();

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
      if (!btn || btn.dataset.makaGoLiveBound === '1') return;
      btn.dataset.makaGoLiveBound = '1';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        void onGoLive();
      });
    }
    // Single CTA — sidebar Go Live (header button removed from markup).
    bindGoLive(els.btnGoLiveSidebar || els.btnGoLive);
    if (els.btnGoLive && els.btnGoLive !== els.btnGoLiveSidebar) {
      // Legacy header button if still present — keep wired but prefer sidebar label.
      bindGoLive(els.btnGoLive);
    }

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
    log('Web studio — checks this site’s relay, then a local sidecar if one is running.');

    var api = {
      probeRelay: probeRelay,
      goLive: onGoLive,
      startGoLive: startGoLive,
      openGoLiveWizard: openGoLiveWizard,
      endLive: onEndLive,
      buildRelayConfigBody: buildRelayConfigBody,
      readBitrateProfile: readBitrateProfile,
      readDestinations: readDestinations,
      syncEncodeSelects: syncEncodeSelects,
      isLive: function () {
        return Boolean(whipPublisher);
      },
      /** Applies program chrome .is-live (also used by headless checks). Prefer goLive/endLive. */
      _setLiveUi: setLiveUi,
      isRelayDetected: function () {
        return relayDetected;
      },
      getRelaySource: relaySource,
      encodeProfiles: Object.keys(ENCODE_PROFILE_MAP),
      defaultBitrateProfile: DEFAULT_BITRATE_PROFILE,
      defaultStreamGame: DEFAULT_STREAM_GAME,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        stopStatusPoll();
        if (durationTimer) clearInterval(durationTimer);
        closeStreamKeyModal();
        closeGoLiveWizard();
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
        setLiveUi(false);
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

  // Auto-boot after DOM is ready so Go Live / chip handlers attach reliably.
  function autoBoot() {
    var hasGoLive =
      document.getElementById('btn-go-live-sidebar') ||
      document.getElementById('btn-go-live') ||
      document.querySelector('[data-hook="go-live"]');
    if (hasGoLive || document.getElementById('relay-status-text')) {
      initLive(document);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBoot);
  } else {
    // Modules are deferred — DOM is already parsed when this runs.
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
