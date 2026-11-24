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
const flist = JSON.parse(await js('window.ivstudio.features.list().then(JSON.stringify)', true))
const fid = (flist.find((f) => f.sequences === 0) || flist[0])?.id
log('feature:', fid, flist.map((f) => f.name).join('/'))
log('Hermes is planning acts, sequences and the cast (a couple of minutes)…')
const t0 = Date.now()
const plan = JSON.parse(await js(`window.ivstudio.features.planAll(${JSON.stringify(fid)}, {}).then(JSON.stringify).catch((e) => JSON.stringify({ error: e.message }))`, true))
log(`planned in ${Math.round((Date.now() - t0) / 1000)}s:`, JSON.stringify(plan))
if (plan.error) process.exit(1)
const f = JSON.parse(await js(`window.ivstudio.features.get(${JSON.stringify(fid)}).then(JSON.stringify)`, true))
log('acts:', f.acts.map((a) => `${a.title} (${a.minutes}m)`).join(' | '))
log('sequences:', f.sequences.map((s) => `${s.title}: ${s.logline}`).join(' | '))
log('cast:', f.cast.map((c) => `${c.name} — ${c.who}`).join(' | '))
log('writing every script and shot now (background)…')
const w = JSON.parse(await js(`window.ivstudio.features.auto(${JSON.stringify(fid)}, {}).then(JSON.stringify)`, true))
log('write:', JSON.stringify(w))
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 15000))
  const tree = JSON.parse(await js(`window.ivstudio.features.explore(${JSON.stringify(fid)}).then(JSON.stringify)`, true))
  const prods = tree.acts.flatMap((a) => a.sequences)
  const total = prods.reduce((n, s) => n + s.scenes.reduce((m, c) => m + c.shots.length, 0), 0)
  const prompted = prods.reduce((n, s) => n + s.scenes.reduce((m, c) => m + c.shots.filter((sh) => sh.prompt || true).length, 0), 0)
  log(`shots: ${total} across ${prods.length} sequences`)
  const states = prods.map((s) => `${s.title}:${s.scenes.reduce((n, c) => n + c.shots.length, 0)}`)
  log('  ', states.join(' | '))
  const p = JSON.parse(await js(`window.ivstudio.productions.get(${JSON.stringify(prods[0]?.id)}).then(JSON.stringify).catch(() => '{}')`, true))
  const b = p.breakdown
  log('  breakdown:', JSON.stringify(b && { state: b.state, scenes: `${b.scenesDone}/${b.scenes}`, shots: `${b.shotsDone}/${b.shots}` }))
  if (total > 0 && b && b.state === 'done') {
    log('done. sample shots:')
    for (const sh of prods[0].scenes[0]?.shots?.slice(0, 3) || []) log('  ', `${sh.seconds}s`, sh.action.slice(0, 70))
    break
  }
}
process.exit(0)
