/**
 * Drives a running dev studio over Chrome DevTools.
 * Start the app first:
 *   npm run dev -- --remote-debugging-port=9223
 */
const port = Number(process.env.MAKA_CDP_PORT || 9223)

async function waitForPage() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json())
      const page = list.find((entry) => entry.type === 'page' && /Maka/i.test(entry.title || ''))
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      // devtools port not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`No Maka page on http://127.0.0.1:${port}`)
}

function cdp(ws) {
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
  })
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id
      pending.set(next, { resolve, reject })
      ws.send(JSON.stringify({ id: next, method, params }))
    })
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'evaluate failed')
  }
  return result.result?.value
}

const page = await waitForPage()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', () => reject(new Error('DevTools socket failed')))
})
const send = cdp(ws)
await send('Runtime.enable')

const report = await evaluate(send, `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const click = (selector) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error('missing ' + selector)
    el.click()
  }
  await wait(600)
  click('[data-scene-menu="intermission"]')
  const timerVisible = !document.getElementById('scene-menu-timer-5').hidden
  click('[data-intermission-min="5"]')
  await wait(700)
  const subtitle = document.getElementById('program-scene-card-subtitle').textContent
  const scene = document.getElementById('program-scene-card').dataset.scene
  const thumbHidden = document.getElementById('stream-thumb-canvas').hidden
  click('#btn-add-scene-alt')
  await wait(500)
  const custom = document.querySelector('[data-custom-scene-row] [data-scene-menu]')
  const customId = custom?.dataset.sceneMenu || ''
  custom?.click()
  const uploadLabel = document.getElementById('scene-image-menu-pick')?.textContent?.trim() || ''
  const deleteVisible = !document.getElementById('scene-menu-delete').hidden
  click('#scene-image-menu-delete')
  await wait(400)
  const customGone = !customId || !document.querySelector('[data-scene="' + customId + '"]')
  click('#btn-go-live')
  await wait(500)
  const wizardOpen = document.getElementById('go-live-wizard-dialog').open
  if (wizardOpen) document.getElementById('go-live-wizard-dialog').close()
  const fps = document.getElementById('stat-fps').textContent
  const viewers = document.getElementById('stream-viewers').textContent
  return {
    timerVisible,
    subtitle,
    scene,
    customId,
    uploadLabel,
    deleteVisible,
    customGone,
    wizardOpen,
    fps,
    viewers,
    chatHint: document.getElementById('program-chat-hint').textContent,
    audioDisabled: document.getElementById('btn-desktop-audio-settings').disabled,
    thumbHidden,
    encodeInStats: Boolean(document.querySelector('.program-stats-right #program-quality-select')),
    addKeyLine: Boolean(document.getElementById('stream-destinations-hint')),
    alertCard: Boolean(document.getElementById('program-alert')),
    streamTitle: document.getElementById('stream-title-text')?.textContent || '',
  }
})()`)

console.log(JSON.stringify(report, null, 2))
const failures = []
if (!report.timerVisible) failures.push('intermission timer menu hidden')
if (report.scene !== 'intermission') failures.push('intermission scene not selected')
if (!String(report.subtitle).startsWith('Back in')) failures.push('timer subtitle missing: ' + report.subtitle)
if (!report.customId.startsWith('custom-')) failures.push('custom scene was not added')
if (!report.deleteVisible) failures.push('delete scene hidden')
if (report.uploadLabel !== 'Upload image…') failures.push('custom scene menu missing upload image: ' + report.uploadLabel)
if (!report.customGone) failures.push('custom scene was not deleted')
if (!report.wizardOpen) failures.push('top-bar Go Live did not open the wizard')
if (report.encodeInStats) failures.push('encode profile is still in the stats bar')
if (report.addKeyLine) failures.push('stream info still has an add-key line')
if (!report.alertCard) failures.push('in-stream alert card missing')
if (!String(report.fps).startsWith('FPS:')) failures.push('fps stat missing')
if (report.viewers !== 'Offline') failures.push('viewer label: ' + report.viewers)
if (report.audioDisabled) failures.push('desktop audio gear is disabled')
if (report.thumbHidden) failures.push('stream thumb was not painted for the intermission card')
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('studio ui wiring passed')
ws.close()
