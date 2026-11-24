// Cloud GPU spending: a daily budget over what the person's own cloud (RunPod or Modal) costs while a GPU is
// up, and the record behind it. The title-bar meter polls cloud:usage every 30 s; each poll adds the GPU-seconds
// since the last poll to the ledger (cloudspend.json in the data folder, the last 90 days kept). When the day's
// total reaches the budget, Techlit Studio shuts the GPU down and refuses new wakes until tomorrow or a higher
// limit. Comfy Cloud bills per run on the person's Comfy account, so it is not counted here; the chat's own
// budget (spending.js) covers paid chat steps.
import fs from 'node:fs'
import path from 'node:path'

export const CLOUD_BUDGET_DEFAULTS = { on: false, daily: 5 } // daily: US dollars
export const CLOUD_LEDGER_FILE = 'cloudspend.json'
const KEEP_DAYS = 90
const DAY = 24 * 3600 * 1000
// A GPU first seen this poll counts from its start, but no further back than this: after an app restart the
// earlier polls' seconds are already in the ledger, and a pod that booted while Techlit Studio was closed
// should not dump hours into today's total.
const BACKFILL_CAP_MS = 60 * 1000

const dollars = (v, d) => (v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 100) / 100 : d)
// settings.cloudBudget, made safe: { on, daily } in USD
export function cloudBudgetOf(settings = {}) {
  const b = settings?.cloudBudget || {}
  return { on: b.on === true, daily: dollars(b.daily, CLOUD_BUDGET_DEFAULTS.daily) }
}

export function readCloudLedger(dataDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir, CLOUD_LEDGER_FILE), 'utf8'))
    return Array.isArray(j.entries) ? j.entries : []
  } catch {
    return []
  }
}
// Adds one poll's spend ({ usd, seconds, provider, gpu }); keeps the last 90 days.
export function addCloudSpend(dataDir, entry, now = new Date()) {
  const cutoff = now.getTime() - KEEP_DAYS * DAY
  const entries = [...readCloudLedger(dataDir).filter((e) => Date.parse(e.at) >= cutoff), { at: now.toISOString(), ...entry }]
  fs.mkdirSync(dataDir, { recursive: true })
  const file = path.join(dataDir, CLOUD_LEDGER_FILE)
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ entries }, null, 1))
  fs.renameSync(`${file}.tmp`, file)
  return entries
}
const dayStart = (now) => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
export const cloudSpentToday = (entries, now = new Date()) => entries.filter((e) => Date.parse(e.at) >= dayStart(now)).reduce((sum, e) => sum + (Number(e.usd) || 0), 0)

// The last n days' cloud spend, one entry per day, zeros included, today last: the dashboard's day bars.
export function cloudSpendByDay(entries, n = 14, now = new Date()) {
  const start = dayStart(now) - (n - 1) * DAY
  const days = Array.from({ length: n }, (_, i) => {
    const t = new Date(start + i * DAY)
    return { label: t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), tick: String(t.getDate()), usd: 0 }
  })
  for (const e of entries) {
    const i = Math.floor((Date.parse(e.at) - start) / DAY)
    if (i >= 0 && i < n) days[i].usd = Math.round((days[i].usd + (Number(e.usd) || 0)) * 10000) / 10000
  }
  return days
}

// Turns the meter's polls into ledger entries: per running pod/container, the seconds since the last poll
// (or since it started, within the backfill cap). One instance lives in the main process.
export class CloudSpend {
  constructor({ dataDir, now = () => new Date() }) {
    this.dataDir = dataDir
    this.now = now
    this.seen = new Map() // pod/container id -> when it was last counted (ms)
  }
  // running: [{id, startedAt (ms)}]; returns { added (usd), seconds, today (usd) } and writes the ledger.
  record(running, perHour, provider, gpu) {
    const t = this.now().getTime()
    const ids = new Set()
    let seconds = 0
    for (const c of running || []) {
      if (!c?.id) continue
      ids.add(c.id)
      const from = Math.max(this.seen.get(c.id) ?? Math.max(Number(c.startedAt) || t, t - BACKFILL_CAP_MS), Number(c.startedAt) || 0)
      seconds += Math.max(0, (t - from) / 1000)
      this.seen.set(c.id, t)
    }
    for (const id of [...this.seen.keys()]) if (!ids.has(id)) this.seen.delete(id) // gone pods stop counting
    const added = Math.round((seconds / 3600) * (Number(perHour) || 0) * 10000) / 10000
    const entries = added > 0 ? addCloudSpend(this.dataDir, { usd: added, seconds: Math.round(seconds), provider, gpu }, this.now()) : readCloudLedger(this.dataDir)
    return { added, seconds: Math.round(seconds), today: cloudSpentToday(entries, this.now()) }
  }
}

// What the dashboard shows: "Today: $1.24 of $5.00", or the spend alone when the limit is off.
export function cloudTodayLabel(budget, today) {
  return budget.on ? `Today: $${today.toFixed(2)} of $${budget.daily.toFixed(2)}` : `Today: $${today.toFixed(2)}`
}
// Is the day's budget spent? { over, left } — left is what may still be spent today.
export function cloudBudgetCheck(budget, today) {
  const left = Math.max(0, Math.round((budget.daily - today) * 100) / 100)
  return { over: budget.on && today >= budget.daily, left }
}
