import WS from 'ws'

const targets = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
const ws = new WS(page.webSocketDebuggerUrl, { maxPayload: 128 * 1024 * 1024 })
let id = 0
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id
    const h = (raw) => {
      const m = JSON.parse(raw)
      if (m.id === i) {
        ws.off('message', h)
        m.error ? rej(new Error(m.error.message)) : res(m.result)
      }
    }
    ws.on('message', h)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const js = (expression, aw = false, timeout = 600000) =>
  send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: aw, timeout }).then((r) => {
    if (r.result.exceptionDescription) throw new Error('page: ' + JSON.stringify(r.result.exceptionDescription).slice(0, 300))
    return r.result.value
  })
await new Promise((r) => ws.on('open', r))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

log('creating the film…')
const pid = await js(`window.ivstudio.productions.create({ name: 'The Message (demo plan)', logline: 'A lighthouse keeper finds a bottle with a message that changes his quiet evening.', targetSeconds: 36 }).then((p) => p.id)`, true)
log('production:', pid)

log('writing the script with Hermes…')
const t0 = Date.now()
const p1 = JSON.parse(await js(`window.ivstudio.productions.writeScript(${JSON.stringify(pid)}, { idea: 'A lighthouse keeper on a rainy night finds a bottle washed up with a message inside. Quiet, warm, a little mysterious. One character, one place.' }).then(JSON.stringify)`, true))
log(`script done in ${Math.round((Date.now() - t0) / 1000)}s —`, p1.scenes.length, 'scenes,', p1.scenes.map((s) => s.heading).join(' | '))

log('breaking it into shots (background, one Hermes call per scene + per shot)…')
await js(`window.ivstudio.productions.breakDown(${JSON.stringify(pid)}, {}).then(JSON.stringify)`, true)
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 10000))
  const p = JSON.parse(await js(`window.ivstudio.productions.get(${JSON.stringify(pid)}).then(JSON.stringify)`, true))
  const b = p.breakdown || {}
  log(`breakdown: ${b.state || '?'} — scenes ${b.scenesDone || 0}/${b.scenes || 0}, shots ${b.shotsDone || 0}/${b.shots || 0}${b.promptErrors ? `, prompt errors ${b.promptErrors}` : ''}`)
  if (b.state === 'done' || b.state === 'error') {
    const shots = p.scenes.flatMap((s) => s.shots || [])
    log('DONE:', shots.length, 'shots')
    for (const sh of shots.slice(0, 3)) {
      log('—', `${sh.seconds}s`, sh.action.slice(0, 80), '| camera:', sh.camera)
      log('  prompt:', (sh.prompt || '(none)').slice(0, 140).replace(/\n/g, ' '))
    }
    if (shots.length > 3) log(`… and ${shots.length - 3} more (open the film in Projects)`)
    if (b.error) log('breakdown error:', b.error)
    break
  }
}
process.exit(0)
