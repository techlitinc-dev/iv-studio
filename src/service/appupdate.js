// Techlit Studio's update pop-up (Update.jsx UpdateDialog): when Techlit Studio's own update is downloaded, this checks this
// PC's ComfyUI and its node packs too (comfyupdate.js through Studio.comfyUpdates), so the person can update just
// Techlit Studio, or ComfyUI and every node pack as well before Techlit Studio restarts into its new version.
// Every dependency comes in as an argument, so test/app-update.mjs runs it with stand-ins.
import { readRecord, writeRecord } from './comfyupdate.js'

// What the pop-up says about ComfyUI, from a Studio.comfyUpdates answer.
//   kind: 'updates' (something to update), 'current' (nothing new) or 'unavailable' (can't update from here: reason)
export function summarize(info) {
  if (!info?.manager?.present) return { kind: 'unavailable', reason: 'manager', text: 'ComfyUI-Manager isn’t in this ComfyUI, so Techlit Studio can’t update it. Add it in Settings → Setup → ComfyUI updates.' }
  const packs = (info.packs?.withUpdates || []).map((p) => p.title)
  const core = info.comfyui || {}
  // the ComfyUI desktop app updates ComfyUI itself; Techlit Studio does its node packs only
  const coreNew = !info.desktop && !!core.behind
  const parts = []
  if (coreNew) parts.push(`ComfyUI ${core.current} → ${core.latest}`)
  if (packs.length) parts.push(`${packs.length} node pack${packs.length > 1 ? 's' : ''}`)
  return {
    kind: parts.length ? 'updates' : 'current',
    comfyui: { current: core.current || null, latest: core.latest || null, behind: coreNew },
    desktop: !!info.desktop,
    packs,
    installed: info.packs?.installed || 0,
    text: parts.length ? `${parts.join(' and ')} ${parts.length > 1 || packs.length > 1 ? 'have' : 'has'} an update.` : `ComfyUI ${core.current || ''} and your ${info.packs?.installed || 0} node packs are up to date.`.replace('  ', ' ')
  }
}

// The release's notes (GitHub's release text, HTML or Markdown), as a few plain lines for the pop-up.
export function notesOf(notes) {
  const NL = String.fromCharCode(10)
  const text = (Array.isArray(notes) ? notes.map((n) => n?.note || '').join(NL) : String(notes || ''))
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, NL)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
  const lines = text
    .split(NL)
    .map((l) => l.replace(/^\s*(?:[-*•]|#+)\s*/, '').trim())
    .filter(Boolean)
  return lines.slice(0, 8).join(NL) || null
}

// What happened, for the note after Techlit Studio restarts: from comfy-updates.json's record.
export function outcome(record) {
  const results = record?.results || []
  const count = (s) => results.filter((r) => r.status === s && r.pack !== 'comfyui').length
  const core = results.find((r) => r.pack === 'comfyui')
  const failed = results.filter((r) => r.status === 'failed').map((r) => r.pack)
  const bits = []
  if (record?.comfyuiBefore && record?.comfyuiAfter && record.comfyuiBefore !== record.comfyuiAfter) bits.push(`ComfyUI ${record.comfyuiBefore} → ${record.comfyuiAfter}`)
  else if (core?.status === 'current') bits.push('ComfyUI was already current')
  const updated = count('updated')
  if (updated) bits.push(`${updated} node pack${updated > 1 ? 's' : ''} updated`)
  return {
    ok: !failed.length,
    failed,
    text: `${bits.join(', ') || 'Nothing needed updating'}.${failed.length ? ` Didn’t update: ${failed.join(', ')}.` : ''} Undo it in Settings → Setup → ComfyUI updates.`
  }
}

export class AppUpdate {
  // studio: Studio (comfyUpdates, updateComfy, comfy.remote, comfy.url); launcher() and folder(): the person's
  // ComfyUI launcher and folder (settings); comfyUp(url): is ComfyUI answering; isLocal(url); busy(): what this
  // process is doing that a restart would stop (['an edit is exporting', ...]); install(): restart into the new
  // version; dataDir: where comfy-updates.json lives; onChange(state): tell the window.
  constructor({ studio, launcher = () => null, folder = () => null, comfyUp, isLocal, busy = () => [], install, dataDir, onChange = () => {} }) {
    Object.assign(this, { studio, launcher, folder, comfyUp, isLocal, busy, install, dataDir, onChange })
    this.state = { status: 'idle', forVersion: null, summary: null, error: null, at: null }
    this.checking = null
  }

  set(patch) {
    this.state = { ...this.state, ...patch }
    this.onChange(this.state)
    return this.state
  }

  // Checks ComfyUI for the pop-up (once per Techlit Studio version; again when asked, or when the last check is over an
  // hour old). Never throws: a ComfyUI that can't be checked is 'unavailable' with the reason.
  check({ version = null, force = false } = {}) {
    const fresh = this.state.at && Date.now() - Date.parse(this.state.at) < 60 * 60 * 1000
    if (this.checking) return this.checking
    if (!force && fresh && this.state.forVersion === version && ['done', 'unavailable'].includes(this.state.status)) return Promise.resolve(this.state)
    this.checking = (async () => {
      this.set({ status: 'checking', forVersion: version, error: null })
      const at = new Date().toISOString()
      const comfy = this.studio.comfy
      if (comfy.remote || !this.isLocal(comfy.url)) return this.set({ status: 'unavailable', summary: { kind: 'unavailable', reason: 'cloud', text: 'Your renders run on a cloud ComfyUI, which Techlit Studio doesn’t update from here.' }, at })
      if (!(await this.comfyUp(comfy.url, 3000).catch(() => false))) return this.set({ status: 'unavailable', summary: { kind: 'unavailable', reason: 'down', text: 'ComfyUI isn’t running, so it can’t be checked. Start it to update it too.' }, at })
      try {
        const info = await this.studio.comfyUpdates({ launcher: this.launcher() })
        const summary = summarize(info)
        return this.set({ status: summary.kind === 'unavailable' ? 'unavailable' : 'done', summary, at })
      } catch (err) {
        return this.set({ status: 'error', error: err.message, summary: null, at })
      }
    })().finally(() => (this.checking = null))
    return this.checking
  }

  // The pop-up's choice. withComfy: update ComfyUI and every node pack first (a snapshot, then Manager, then a
  // ComfyUI restart; Studio.updateComfy), and restart into Techlit Studio's new version only when that worked. A ComfyUI
  // that's rendering, or a Manager that's busy, stops it before anything changes.
  async run({ withComfy = false, version = null, onProgress = () => {} } = {}) {
    const waits = this.busy()
    if (waits.length) throw new Error(`Update when it's done: ${waits.join(' and ')}.`)
    if (withComfy) {
      onProgress({ phase: 'starting' })
      const record = await this.studio.updateComfy({ folder: this.folder(), launcher: this.launcher(), onProgress })
      // remembered, so Techlit Studio says what happened once it has restarted
      writeRecord(this.dataDir, { ...readRecord(this.dataDir), fromAppUpdate: version, announced: false })
      onProgress({ phase: 'installing', outcome: outcome(record) })
    } else onProgress({ phase: 'installing' })
    await this.install()
    return { installing: true }
  }

  // After the restart: what the ComfyUI update did, once (then it's marked as told).
  notice() {
    const record = readRecord(this.dataDir)
    if (!record?.fromAppUpdate || record.announced) return null
    writeRecord(this.dataDir, { ...record, announced: true })
    return { version: record.fromAppUpdate, ...outcome(record) }
  }
}
