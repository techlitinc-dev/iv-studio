// The cloud GPU spend ledger and daily budget (src/service/cloudspend.js), without a cloud.
//   node test/cloudspend.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CLOUD_BUDGET_DEFAULTS, CloudSpend, cloudBudgetCheck, cloudBudgetOf, cloudSpendByDay, cloudSpentToday, cloudTodayLabel, readCloudLedger } from '../src/service/cloudspend.js'

let pass = 0
let fail = 0
const ok = (cond, what) => (cond ? (pass++, console.log(`  ok   ${what}`)) : (fail++, console.log(`  FAIL ${what}`)))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-cloudspend-'))
const t0 = Date.parse('2026-11-24T10:00:00')
let now = new Date(t0)
const spend = new CloudSpend({ dataDir: dir, now: () => now })

ok(cloudBudgetOf({}).on === false && cloudBudgetOf({}).daily === CLOUD_BUDGET_DEFAULTS.daily, 'budget: off by default, with a sane amount when turned on')
ok(cloudBudgetOf({ cloudBudget: { on: true, daily: 2.5 } }).daily === 2.5 && cloudBudgetOf({ cloudBudget: { on: 'yes', daily: -4 } }).on === false && cloudBudgetOf({ cloudBudget: { on: true, daily: -4 } }).daily === CLOUD_BUDGET_DEFAULTS.daily, 'budget: a strict on/off and a safe amount')

// a pod up for two 30 s polls at $1.20 an hour
let r = spend.record([{ id: 'pod1', startedAt: t0 - 5000 }], 1.2, 'runpod', 'NVIDIA L40S')
ok(r.added > 0 && r.added < 0.002, `first poll counts from the pod's start (5 s = $${r.added}), not more`)
now = new Date(t0 + 30000)
r = spend.record([{ id: 'pod1', startedAt: t0 - 5000 }], 1.2, 'runpod', 'NVIDIA L40S')
ok(Math.abs(r.added - 0.01) < 1e-9, 'the next poll adds only the 30 s since the last one')
ok(Math.abs(r.today - 0.0117) < 0.001, 'today sums the entries')

// an app restart: a running pod must not dump its whole life into the ledger again
const spend2 = new CloudSpend({ dataDir: dir, now: () => now })
now = new Date(t0 + 35000)
r = spend2.record([{ id: 'podOld', startedAt: t0 - 2 * 3600 * 1000 }], 1.2, 'modal', 'L40S')
ok(r.added > 0 && r.added <= (60 / 3600) * 1.2 + 1e-4, 'after a restart, a pod that booted 2 h ago backfills at most a minute')
now = new Date(t0 + 60000)
r = spend2.record([], 1.2, 'modal', 'L40S')
ok(r.added === 0, 'no pods running, nothing added')

const today = cloudSpentToday(readCloudLedger(dir), now)
ok(today > 0.01, `the ledger kept the spend ($${today.toFixed(4)})`)
ok(cloudBudgetCheck({ on: true, daily: 0.01 }, today).over === true && cloudBudgetCheck({ on: false, daily: 0.01 }, today).over === false && cloudBudgetCheck({ on: true, daily: 100 }, today).over === false, 'over the budget only when the limit is on and reached')
ok(cloudBudgetCheck({ on: true, daily: 5 }, 1.234).left === 3.77, 'what is left today')
ok(cloudTodayLabel({ on: true, daily: 5 }, 1.234) === 'Today: $1.23 of $5.00' && cloudTodayLabel({ on: false, daily: 5 }, 1.234) === 'Today: $1.23', 'the dashboard line, with and without the limit')

const days = cloudSpendByDay(readCloudLedger(dir), 7, now)
ok(days.length === 7 && Math.abs(days[6].usd - today) < 1e-9 && days.slice(0, 6).every((d) => d.usd === 0), 'spend by day: the last 7 days, today last, the earlier days zero-filled')

fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
