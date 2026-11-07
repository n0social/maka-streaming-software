/**
 * Maka web studio — Audio Mixer
 * 1:1 port of Electron studio mic / desktop / game meters + mute + faders.
 *
 * Streams arrive via window.MakaStreamAudio or CustomEvent('maka-stream-audio').
 * Without a stream, idle meters match exe chrome (desktop/game at 12%).
 */
;(function (global) {
  'use strict'

  /** @typedef {'mic' | 'desktop' | 'game'} AudioChannelId */

  var CHANNELS = /** @type {const} */ (['desktop', 'mic', 'game'])

  var CHANNEL_META = {
    desktop: {
      id: 'audio-desktop',
      meterId: 'desktop-meter',
      faderId: 'desktop-fader',
      muteId: 'desktop-mute',
      labelId: 'audio-desktop-label',
      icon: '🔊',
      name: 'Desktop Audio',
      settingsId: 'btn-desktop-audio-settings',
      settingsTitle: 'Desktop audio settings',
      idlePercent: 12,
      idleUnavailable: true,
    },
    mic: {
      id: 'audio-mic',
      meterId: 'mic-meter',
      faderId: 'mic-fader',
      muteId: 'mic-mute',
      labelId: 'audio-mic-label',
      icon: '🎙',
      name: 'Microphone',
      settingsId: 'btn-mic-audio-settings',
      settingsTitle: 'Microphone settings',
      idlePercent: 0,
      idleUnavailable: false,
    },
    game: {
      id: 'audio-game',
      meterId: 'game-meter',
      faderId: 'game-fader',
      muteId: 'game-mute',
      labelId: 'audio-game-label',
      icon: '🎮',
      name: 'Game Audio',
      settingsId: 'btn-game-audio-settings',
      settingsTitle: 'Game audio settings',
      idlePercent: 12,
      idleUnavailable: true,
    },
  }

  /** @type {Record<AudioChannelId, ChannelRuntime>} */
  var runtime = {
    desktop: makeRuntime(),
    mic: makeRuntime(),
    game: makeRuntime(),
  }

  /** @type {HTMLElement | null} */
  var rootEl = null
  var ready = false

  /**
   * @typedef {{
   *   stream: MediaStream | null,
   *   muted: boolean,
   *   gainDb: number,
   *   ctx: AudioContext | null,
   *   source: MediaStreamAudioSourceNode | null,
   *   gain: GainNode | null,
   *   analyser: AnalyserNode | null,
   *   raf: number,
   *   data: Uint8Array | null,
   * }} ChannelRuntime
   */

  function makeRuntime() {
    return {
      stream: null,
      muted: false,
      gainDb: 0,
      ctx: null,
      source: null,
      gain: null,
      analyser: null,
      raf: 0,
      data: null,
    }
  }

  function dbToGain(db) {
    if (db <= -60) return 0
    return Math.pow(10, db / 20)
  }

  function setMeterWidth(el, percent) {
    if (!el) return
    var level = Math.max(0, Math.min(100, percent))
    el.style.width = level + '%'
    el.style.removeProperty('height')
  }

  function channelEls(id) {
    var meta = CHANNEL_META[id]
    return {
      channel: document.getElementById(meta.id),
      meter: document.getElementById(meta.meterId),
      fader: /** @type {HTMLInputElement | null} */ (document.getElementById(meta.faderId)),
      muteBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById(meta.muteId)),
      label: document.getElementById(meta.labelId),
      settings: /** @type {HTMLButtonElement | null} */ (document.getElementById(meta.settingsId)),
    }
  }

  function stopMeter(id) {
    var rt = runtime[id]
    if (rt.raf) {
      cancelAnimationFrame(rt.raf)
      rt.raf = 0
    }
    rt.analyser = null
    rt.data = null
    if (rt.source) {
      try {
        rt.source.disconnect()
      } catch (_) {}
      rt.source = null
    }
    rt.gain = null
    if (rt.ctx) {
      var ctx = rt.ctx
      rt.ctx = null
      void ctx.close()
    }
  }

  function applyTrackEnabled(id) {
    var rt = runtime[id]
    if (!rt.stream) return
    var tracks = rt.stream.getAudioTracks()
    for (var i = 0; i < tracks.length; i++) {
      tracks[i].enabled = !rt.muted
    }
    if (rt.gain) {
      rt.gain.gain.value = rt.muted ? 0 : dbToGain(rt.gainDb)
    }
  }

  function tickMeter(id) {
    var rt = runtime[id]
    var els = channelEls(id)
    if (!rt.analyser || !rt.data || !els.meter) {
      rt.raf = 0
      return
    }
    rt.analyser.getByteFrequencyData(rt.data)
    var sum = 0
    for (var i = 0; i < rt.data.length; i++) sum += rt.data[i]
    var avg = sum / rt.data.length / 255
    var percent = Math.min(100, Math.round(avg * 140))
    if (rt.muted) percent = 0
    setMeterWidth(els.meter, percent)
    rt.raf = requestAnimationFrame(function () {
      tickMeter(id)
    })
  }

  function startMeter(id, stream) {
    stopMeter(id)
    var rt = runtime[id]
    rt.stream = stream
    try {
      var ctx = new AudioContext()
      var source = ctx.createMediaStreamSource(stream)
      var gain = ctx.createGain()
      var analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      gain.gain.value = rt.muted ? 0 : dbToGain(rt.gainDb)
      source.connect(gain)
      gain.connect(analyser)
      // Analyser only — do not route to speakers (preview bus is separate).
      rt.ctx = ctx
      rt.source = source
      rt.gain = gain
      rt.analyser = analyser
      rt.data = new Uint8Array(analyser.frequencyBinCount)
      applyTrackEnabled(id)
      tickMeter(id)
    } catch (_) {
      stopMeter(id)
      rt.stream = stream
      applyTrackEnabled(id)
      showIdleMeter(id)
    }
  }

  function showIdleMeter(id) {
    var meta = CHANNEL_META[id]
    var els = channelEls(id)
    setMeterWidth(els.meter, meta.idlePercent)
  }

  function syncChannelUi(id) {
    var meta = CHANNEL_META[id]
    var rt = runtime[id]
    var els = channelEls(id)
    var hasStream = Boolean(rt.stream && rt.stream.getAudioTracks().length)
    if (els.channel) {
      els.channel.dataset.muted = rt.muted ? '1' : '0'
      els.channel.dataset.idle = hasStream ? '0' : '1'
      if (meta.idleUnavailable) {
        els.channel.dataset.captureUnavailable = hasStream ? '0' : '1'
      } else {
        els.channel.dataset.captureUnavailable = '0'
      }
      if (!hasStream) {
        els.channel.title =
          id === 'mic'
            ? 'Microphone — waiting for stream'
            : meta.name + ' — waiting for capture (idle)'
      } else if (rt.muted) {
        els.channel.title = meta.name + ' muted (click name or Mute to unmute)'
      } else {
        els.channel.title = meta.name + ' — click name or Mute to mute'
      }
    }
    if (els.label) {
      els.label.setAttribute('aria-pressed', rt.muted ? 'true' : 'false')
      els.label.title = rt.muted ? 'Unmute ' + meta.name : 'Mute ' + meta.name
    }
    if (els.muteBtn) {
      els.muteBtn.setAttribute('aria-pressed', rt.muted ? 'true' : 'false')
      els.muteBtn.textContent = rt.muted ? 'Unmute' : 'Mute'
      els.muteBtn.title = rt.muted ? 'Unmute ' + meta.name : 'Mute ' + meta.name
    }
    if (els.fader) {
      els.fader.disabled = !hasStream
      els.fader.value = String(rt.gainDb)
    }
    if (!hasStream) {
      showIdleMeter(id)
    } else if (rt.muted) {
      setMeterWidth(els.meter, 0)
    }
  }

  function setMuted(id, muted) {
    var rt = runtime[id]
    rt.muted = Boolean(muted)
    applyTrackEnabled(id)
    syncChannelUi(id)
    dispatchChange(id)
  }

  function toggleMute(id) {
    setMuted(id, !runtime[id].muted)
  }

  function setGainDb(id, db) {
    var rt = runtime[id]
    var next = Math.max(-30, Math.min(0, Number(db) || 0))
    rt.gainDb = next
    if (rt.gain && !rt.muted) {
      rt.gain.gain.value = dbToGain(next)
    }
    var els = channelEls(id)
    if (els.fader && els.fader.value !== String(next)) {
      els.fader.value = String(next)
    }
    dispatchChange(id)
  }

  /**
   * @param {AudioChannelId} id
   * @param {MediaStream | null | undefined} stream
   */
  function setStream(id, stream) {
    if (CHANNELS.indexOf(id) === -1) return
    var rt = runtime[id]
    stopMeter(id)
    rt.stream = null
    if (stream && stream.getAudioTracks && stream.getAudioTracks().length) {
      startMeter(id, stream)
    } else {
      showIdleMeter(id)
    }
    syncChannelUi(id)
    dispatchChange(id)
  }

  function dispatchChange(id) {
    var rt = runtime[id]
    var detail = {
      channel: id,
      muted: rt.muted,
      gainDb: rt.gainDb,
      hasStream: Boolean(rt.stream),
    }
    try {
      global.dispatchEvent(new CustomEvent('maka-stream-audio-change', { detail: detail }))
    } catch (_) {}
  }

  function dbScaleHtml() {
    return (
      '<div class="audio-db-scale" aria-hidden="true">' +
      '<span>-30</span><span>-24</span><span>-18</span><span>-12</span><span>-6</span><span>0</span>' +
      '</div>'
    )
  }

  function channelHtml(id) {
    var meta = CHANNEL_META[id]
    return (
      '<div class="audio-channel-wrap" data-channel="' +
      id +
      '">' +
      '<div class="audio-channel" id="' +
      meta.id +
      '" data-capture-unavailable="0" data-muted="0" data-idle="1">' +
      '<span class="audio-channel-icon" aria-hidden="true">' +
      meta.icon +
      '</span>' +
      '<button type="button" class="audio-channel-name" id="' +
      meta.labelId +
      '" aria-pressed="false">' +
      meta.name +
      '</button>' +
      '<div class="audio-meter-track" aria-hidden="true">' +
      '<div class="audio-meter" id="' +
      meta.meterId +
      '"></div>' +
      '</div>' +
      '<button type="button" class="audio-channel-mute" id="' +
      meta.muteId +
      '" aria-pressed="false">Mute</button>' +
      '<button type="button" class="audio-channel-settings" id="' +
      meta.settingsId +
      '" title="' +
      meta.settingsTitle +
      '" aria-label="' +
      meta.settingsTitle +
      '">⚙</button>' +
      '</div>' +
      '<input type="range" class="audio-fader" id="' +
      meta.faderId +
      '" min="-30" max="0" value="0" step="1" aria-label="' +
      meta.name +
      ' volume" disabled />' +
      dbScaleHtml() +
      '</div>'
    )
  }

  function ensureMarkup(mount) {
    var existing = mount.querySelector('.audio-mixer') || (mount.id === 'audio-mixer' ? mount : null)
    var mixer
    if (existing && existing.querySelector('#mic-meter') && existing.querySelector('#desktop-meter')) {
      mixer = existing
      // Upgrade older markup: ensure mute + fader exist.
      CHANNELS.forEach(function (id) {
        var meta = CHANNEL_META[id]
        var channel = document.getElementById(meta.id)
        if (!channel) return
        var label = channel.querySelector('.audio-channel-name')
        if (label && label.tagName !== 'BUTTON') {
          var btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'audio-channel-name'
          btn.id = meta.labelId
          btn.textContent = label.textContent || meta.name
          btn.setAttribute('aria-pressed', 'false')
          label.replaceWith(btn)
        } else if (label && !label.id) {
          label.id = meta.labelId
        }
        if (!document.getElementById(meta.muteId)) {
          var mute = document.createElement('button')
          mute.type = 'button'
          mute.className = 'audio-channel-mute'
          mute.id = meta.muteId
          mute.setAttribute('aria-pressed', 'false')
          mute.textContent = 'Mute'
          var settings = channel.querySelector('.audio-channel-settings')
          if (settings) channel.insertBefore(mute, settings)
          else channel.appendChild(mute)
        }
        var settingsBtn = channel.querySelector('.audio-channel-settings')
        if (settingsBtn && !settingsBtn.id && meta.settingsId) {
          settingsBtn.id = meta.settingsId
        }
        var wrap = channel.closest('.audio-channel-wrap') || channel.parentElement
        if (wrap && !document.getElementById(meta.faderId)) {
          var fader = document.createElement('input')
          fader.type = 'range'
          fader.className = 'audio-fader'
          fader.id = meta.faderId
          fader.min = '-30'
          fader.max = '0'
          fader.value = '0'
          fader.step = '1'
          fader.disabled = true
          fader.setAttribute('aria-label', meta.name + ' volume')
          var scale = wrap.querySelector('.audio-db-scale')
          if (scale) wrap.insertBefore(fader, scale)
          else wrap.appendChild(fader)
        }
        if (wrap && !wrap.querySelector('.audio-db-scale')) {
          wrap.insertAdjacentHTML('beforeend', dbScaleHtml())
        }
      })
      return mixer
    }

    mixer = existing && existing.classList.contains('audio-mixer') ? existing : null
    if (!mixer) {
      if (mount.id === 'audio-mixer' || mount.classList.contains('audio-mixer')) {
        mixer = mount
      } else {
        mixer = document.createElement('div')
        mixer.className = 'audio-mixer'
        mixer.id = 'audio-mixer'
        mount.appendChild(mixer)
      }
    }
    mixer.innerHTML = CHANNELS.map(channelHtml).join('')
    return mixer
  }

  function wireControls() {
    CHANNELS.forEach(function (id) {
      var els = channelEls(id)
      if (els.label) {
        els.label.addEventListener('click', function () {
          toggleMute(id)
        })
      }
      if (els.muteBtn) {
        els.muteBtn.addEventListener('click', function () {
          toggleMute(id)
        })
      }
      if (els.fader) {
        els.fader.addEventListener('input', function () {
          setGainDb(id, Number(els.fader && els.fader.value))
        })
      }
      if (els.settings) {
        els.settings.addEventListener('click', function () {
          try {
            global.dispatchEvent(
              new CustomEvent('maka-stream-audio-settings', { detail: { channel: id } }),
            )
          } catch (_) {}
        })
      }
    })
  }

  function findMount() {
    return (
      document.getElementById('audio-mixer') ||
      document.getElementById('maka-audio-mixer') ||
      document.querySelector('[data-maka-audio-mixer]') ||
      null
    )
  }

  function init(mount) {
    var target = mount || findMount()
    if (!target) {
      // Shell may mount later — expose bus anyway; call mount() when ready.
      ready = false
      return api
    }
    rootEl = ensureMarkup(target)
    wireControls()
    CHANNELS.forEach(function (id) {
      syncChannelUi(id)
    })
    ready = true
    return api
  }

  function onBusEvent(ev) {
    var detail = (ev && ev.detail) || {}
    var channel = detail.channel || detail.id
    if (!channel || CHANNELS.indexOf(channel) === -1) return
    if ('stream' in detail) {
      setStream(channel, detail.stream || null)
    }
    if ('muted' in detail) {
      setMuted(channel, detail.muted)
    }
    if ('gainDb' in detail) {
      setGainDb(channel, detail.gainDb)
    }
  }

  var api = {
    channels: CHANNELS.slice(),
    init: init,
    mount: init,
    setStream: setStream,
    clearStream: function (id) {
      setStream(id, null)
    },
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: function (id) {
      return Boolean(runtime[id] && runtime[id].muted)
    },
    setGainDb: setGainDb,
    getGainDb: function (id) {
      return runtime[id] ? runtime[id].gainDb : 0
    },
    getStream: function (id) {
      return runtime[id] ? runtime[id].stream : null
    },
    /** Assign several streams at once: { mic, desktop, game } */
    setStreams: function (map) {
      if (!map) return
      CHANNELS.forEach(function (id) {
        if (id in map) setStream(id, map[id] || null)
      })
    },
    sync: function () {
      CHANNELS.forEach(syncChannelUi)
    },
    destroy: function () {
      CHANNELS.forEach(stopMeter)
      ready = false
    },
  }

  global.MakaStreamAudio = api
  global.addEventListener('maka-stream-audio', onBusEvent)

  function boot() {
    init()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})(typeof window !== 'undefined' ? window : globalThis)
