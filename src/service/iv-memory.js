// IV memory: what the person's IV apps know about them and each business, shared by every IV chat (IV Hivemind,
// Outreach, Studio, Signal) whichever agent runs it. One small SQLite file beside the shared workspace, on this PC
// only. Scope "you" is about the person; a business scope is a shared business ID from the workspace.
// Never stores passwords, keys or tokens. Identical source is shipped by the apps that use it.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDir } from './iv-workspace.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const MAX_MEMORIES = 600
export const MAX_TEXT = 600
// Things that look like credentials. A memory is a fact about the person, never a secret.
const SECRET = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|\b(password|passcode|api[ _-]?key|secret[ _-]?key|access[ _-]?token|one[ -]time code)\b\s*[:=]\s*\S+)/i

export const looksSecret = text => SECRET.test(String(text))
export const validScope = scope => scope === 'you' || UUID.test(String(scope || ''))

function cleanText(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) throw new Error('Write the memory first.')
  if (value.length > MAX_TEXT) throw new Error(`Keep a memory under ${MAX_TEXT} characters.`)
  if (looksSecret(value)) throw new Error('Techlit memory never keeps passwords, keys or codes.')
  return value
}

export function openMemory(root = workspaceDir()) {
  mkdirSync(root, { recursive: true })
  const db = new DatabaseSync(join(root, 'memory.db'))
  db.exec(`pragma journal_mode=WAL; pragma busy_timeout=5000;
    create table if not exists meta(key text primary key, value text not null);
    create table if not exists memories(id text primary key, scope text not null, text text not null, source text not null,
      by text not null, created_at text not null, updated_at text not null);
    create index if not exists memories_scope on memories(scope);`)
  const version = db.prepare('select value from meta where key = ?').get('version')?.value
  if (version && version !== '1') { db.close(); throw new Error('Update this IV app to use the newer memory.') }
  db.prepare('insert or ignore into meta values (?, ?)').run('version', '1')
  const row = r => r && { id: r.id, scope: r.scope, text: r.text, source: r.source, by: r.by, createdAt: r.created_at, updatedAt: r.updated_at }

  const api = {
    list(scope) {
      const rows = scope ? db.prepare('select * from memories where scope = ? order by updated_at desc').all(scope) : db.prepare('select * from memories order by updated_at desc').all()
      return rows.map(row)
    },
    get: id => row(db.prepare('select * from memories where id = ?').get(id)),
    add({ scope = 'you', text, source = 'manual', by = 'hivemind' }) {
      if (!validScope(scope)) throw new Error('Choose who this memory is about.')
      const value = cleanText(text)
      const same = db.prepare('select * from memories where scope = ? and lower(text) = lower(?)').get(scope, value)
      if (same) return { ...row(same), existed: true }
      if (db.prepare('select count(*) as n from memories').get().n >= MAX_MEMORIES) throw new Error('Techlit memory is full. Remove a few memories first.')
      const at = new Date().toISOString()
      const id = randomUUID()
      db.prepare('insert into memories values (?, ?, ?, ?, ?, ?, ?)').run(id, scope, value, String(source).slice(0, 80), String(by).slice(0, 40), at, at)
      return api.get(id)
    },
    update(id, { text, scope }) {
      const current = api.get(id)
      if (!current) throw new Error('That memory is no longer here.')
      const next = { text: text === undefined ? current.text : cleanText(text), scope: scope === undefined ? current.scope : scope }
      if (!validScope(next.scope)) throw new Error('Choose who this memory is about.')
      db.prepare('update memories set text = ?, scope = ?, updated_at = ? where id = ?').run(next.text, next.scope, new Date().toISOString(), id)
      return api.get(id)
    },
    remove(id) {
      const gone = db.prepare('delete from memories where id = ?').run(id).changes
      if (!gone) throw new Error('That memory is no longer here.')
      return { removed: id }
    },
    search(query, scopes) {
      const words = String(query || '').toLowerCase().split(/\W+/).filter(word => word.length > 2)
      return api.list().filter(item => !scopes || scopes.includes(item.scope))
        .map(item => ({ item, score: words.filter(word => item.text.toLowerCase().includes(word)).length }))
        .filter(entry => !words.length || entry.score > 0)
        .sort((a, b) => b.score - a.score).slice(0, 20).map(entry => entry.item)
    },
    // The memories a chat gets with each message: about the person, then about the selected business.
    prompt({ brandId = '', brandName = '', limit = 6000 } = {}) {
      const lines = []
      let used = 0
      const take = (title, items) => {
        if (!items.length) return
        lines.push(title)
        for (const item of items) {
          if (used + item.text.length > limit) break
          lines.push(`- ${item.text}`)
          used += item.text.length
        }
      }
      take('About the person:', api.list('you'))
      if (brandId) take(`About ${brandName || 'this business'}:`, api.list(brandId))
      return lines.join('\n')
    },
    close: () => db.close(),
  }
  return api
}
