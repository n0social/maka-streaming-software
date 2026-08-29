/** Hello Tabcast — minimal sandboxed addon using tabcast.addons API. */
;(async () => {
  const status = document.getElementById('status')
  const meta = document.getElementById('meta')
  const btn = document.getElementById('btn-toast')

  if (!window.tabcast?.addons) {
    status.textContent = 'tabcast.addons bridge not available'
    return
  }

  const api = window.tabcast.addons

  try {
    const info = await api.getInfo()
    meta.textContent = `${info.name} v${info.version} · API ${info.apiVersion}`
    status.textContent = 'Runtime ready'

    api.onLiveEvent((payload) => {
      status.textContent = `Event: ${payload.event}`
    })

    btn?.addEventListener('click', () => {
      void api.toast('Hello from sandboxed addon runtime!')
    })
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err)
  }
})()
