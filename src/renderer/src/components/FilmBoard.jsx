import { useEffect, useMemo, useState } from 'react'
import { fileUrl } from './edit/model'
import { Chips } from './ShelfKit'
import { FILM_STATE, clock, estimate, plural } from './filmkit'

// The board's management layer for a film of any size (src/service/productions.js): one toolbar over the
// storyboard with three views (Panels, Table, Lines), a status filter with counts, search, scene folding,
// shot picking and bulk actions. The data and the actions stay Productions'; this is how a 1,000-shot film
// is worked through: fold the scenes, filter to what needs you, pick a run of shots, film them.
const P = () => window.ivstudio.productions

// The state a board is worked in: which view, which filter, the search, the picked shots and the folded scenes
// (kept on this PC per film). shots are Productions' shots with their state, so a poll while filming refreshes
// counts and rows but never what someone is typing (Cell holds its own text while focused).
export function useFilmBoard(v) {
  const [view, setViewState] = useState(() => {
    try {
      const x = localStorage.getItem('iv.filmView')
      return ['panels', 'table', 'lines'].includes(x) ? x : 'panels'
    } catch {
      return 'panels'
    }
  })
  const setView = (x) => {
    setViewState(x)
    try {
      localStorage.setItem('iv.filmView', x)
    } catch {}
  }
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [selecting, setSelectingState] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const setSelecting = (on) => {
    setSelectingState(on)
    if (!on) setSelected(new Set())
  }
  const [shut, setShut] = useState(() => new Set())
  useEffect(() => {
    try {
      setShut(new Set(JSON.parse(localStorage.getItem(`iv.filmShut:${v.id}`) || '[]')))
    } catch {
      setShut(new Set())
    }
  }, [v.id])
  const saveShut = (next) => {
    setShut(next)
    try {
      localStorage.setItem(`iv.filmShut:${v.id}`, JSON.stringify([...next]))
    } catch {}
  }
  const toggleShut = (id) => {
    const n = new Set(shut)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    saveShut(n)
  }
  const shutAll = (on) => saveShut(on ? new Set(v.scenes.map((s) => s.id)) : new Set())
  const toggle = (id) => {
    setSelected((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const selectMany = (ids) => setSelected(new Set(ids))
  const clear = () => setSelected(new Set())
  // every shot's number in script order, the way the film is talked about ("shot 214")
  const nums = useMemo(() => {
    const m = new Map()
    let n = 0
    for (const sc of v.scenes) for (const sh of sc.shots) m.set(sh.id, ++n)
    return m
  }, [v.scenes])
  const statusOf = (sh) => sh.state?.status || 'draft'
  const counts = useMemo(() => {
    const all = v.scenes.flatMap((s) => s.shots).map(statusOf)
    const c = (fn) => all.filter(fn).length
    return {
      all: all.length,
      attention: c((s) => s === 'error' || s === 'pick' || s === 'draft'),
      todo: c((s) => s === 'ready'),
      filming: c((s) => ['speaking', 'queued', 'rendering', 'finishing'].includes(s)),
      pick: c((s) => s === 'pick'),
      done: c((s) => s === 'finished'),
      error: c((s) => s === 'error')
    }
  }, [v.scenes])
  const needle = q.trim().toLowerCase()
  const match = (sh, sc) => {
    const st = statusOf(sh)
    const ok =
      filter === 'all'
        ? true
        : filter === 'attention'
          ? st === 'error' || st === 'pick' || st === 'draft'
          : filter === 'todo'
            ? st === 'ready'
            : filter === 'filming'
              ? ['speaking', 'queued', 'rendering', 'finishing'].includes(st)
              : filter === 'pick'
                ? st === 'pick'
                : filter === 'done'
                  ? st === 'finished'
                  : st === 'error'
    if (!ok) return false
    if (!needle) return true
    return `${nums.get(sh.id)} ${sh.action || ''} ${sh.line || ''} ${sh.speaker || ''} ${sh.camera || ''} ${sc.location || ''} ${sc.heading || ''}`.toLowerCase().includes(needle)
  }
  const shown = (sc) => sc.shots.filter((sh) => match(sh, sc))
  const filtering = filter !== 'all' || !!needle
  return { view, setView, filter, setFilter, q, setQ, selecting, setSelecting, selected, toggle, selectMany, clear, shut, toggleShut, shutAll, nums, counts, shown, filtering, statusOf }
}

// The toolbar over the board: the view, the filter with its counts, the search, a scene jump, folding and picking.
export function BoardTools({ fb, scenes }) {
  const FILTERS = [
    ['all', 'All', fb.counts.all],
    ['attention', 'Needs you', fb.counts.attention],
    ['todo', 'To film', fb.counts.todo],
    ['filming', 'Filming', fb.counts.filming],
    ['pick', 'To pick', fb.counts.pick],
    ['done', 'Done', fb.counts.done],
    ['error', 'Failed', fb.counts.error]
  ]
  return (
    <div className="film-tools">
      <div className="segmented" role="tablist" aria-label="Board view">
        {[
          ['panels', 'Panels'],
          ['table', 'Table'],
          ['lines', 'Lines']
        ].map(([id, name]) => (
          <button key={id} role="tab" aria-selected={fb.view === id} className={fb.view === id ? 'on' : ''} onClick={() => fb.setView(id)}>
            {name}
          </button>
        ))}
      </div>
      <Chips label="Show" value={fb.filter} onChange={fb.setFilter} options={FILTERS} />
      <input className="film-search mono small" type="search" aria-label="Find a shot" placeholder="Find a shot: words, who, camera, №…" value={fb.q} onChange={(e) => fb.setQ(e.target.value)} />
      {scenes.length > 4 && fb.view !== 'lines' && (
        <select
          className="film-jump mono small"
          value=""
          aria-label="Jump to a scene"
          onChange={(e) => {
            const el = e.target.value && document.getElementById(`film-scene-${e.target.value}`)
            if (el) {
              fb.shut.has(e.target.value) && fb.toggleShut(e.target.value)
              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            e.target.value = ''
          }}
        >
          <option value="">Jump to a scene…</option>
          {scenes.map((sc, k) => (
            <option key={sc.id} value={sc.id}>
              Scene {k + 1} · {sc.location || sc.heading}
            </option>
          ))}
        </select>
      )}
      <span className="film-tools-end">
        <button className="link-btn mono small" onClick={() => fb.shutAll(true)}>
          Fold all
        </button>
        <button className="link-btn mono small" onClick={() => fb.shutAll(false)}>
          Open all
        </button>
        <button className={`btn btn-small ${fb.selecting ? 'btn-primary' : ''}`} onClick={() => fb.setSelecting(!fb.selecting)}>
          {fb.selecting ? 'Done picking' : 'Pick shots'}
        </button>
      </span>
    </div>
  )
}

// A scene's rollup for its header: its length, how many shots, and a bar of done (and to-pick) against the rest.
export function SceneProg({ sc }) {
  const all = sc.shots
  const n = (st) => all.filter((s) => (s.state?.status || 'draft') === st).length
  const done = n('finished')
  const pick = n('pick')
  const bad = n('error')
  const busy = n('rendering') + n('finishing') + n('speaking') + n('queued')
  return (
    <span className="film-scene-prog">
      <span className="mono small dim">
        {clock(all.reduce((x, s) => x + s.seconds, 0))} · {plural(all.length, 'shot')}
      </span>
      {all.length > 0 && (
        <span className="film-prog" title={`${done} done${pick ? `, ${pick} to pick` : ''}${busy ? `, ${busy} filming` : ''}${bad ? `, ${bad} failed` : ''}`}>
          <span className="film-prog-done" style={{ width: `${(done / all.length) * 100}%` }} />
          <span className="film-prog-pick" style={{ width: `${(pick / all.length) * 100}%` }} />
        </span>
      )}
      <span className="mono small dim">
        {done}/{all.length} done
      </span>
      {pick > 0 && <span className="mono small film-tone-pick">{pick} to pick</span>}
      {bad > 0 && <span className="mono small pink">{bad} failed</span>}
    </span>
  )
}

// An inline edit that survives the board's polling: it holds its own text while focused and takes the shot's
// value back when it isn't. Enter or leaving the field saves; Escape puts the old words back.
// (Also Story-refine's editor fields, StoryRefine.jsx.)
export function Cell({ value, onCommit, area = false, type = 'text', title, placeholder = '' }) {
  const [val, setVal] = useState(value ?? '')
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    if (!focus) setVal(value ?? '')
  }, [value, focus])
  const commit = () => {
    const next = type === 'number' ? Number(val) : val
    if (type === 'number' && (!Number.isFinite(next) || next <= 0)) return setVal(value ?? '')
    if (String(next) !== String(value ?? '')) onCommit(next)
  }
  const keys = (e) => {
    if (e.key === 'Enter' && !area) e.currentTarget.blur()
    if (e.key === 'Escape') {
      setVal(value ?? '')
      e.currentTarget.blur()
    }
  }
  const props = {
    value: val,
    title,
    placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => {
      setFocus(false)
      commit()
    },
    onKeyDown: keys,
    onClick: (e) => e.stopPropagation()
  }
  return area ? <textarea rows={2} {...props} onChange={(e) => setVal(e.target.value)} /> : <input type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 15 : undefined} {...props} onChange={(e) => setVal(e.target.value)} />
}

// The board as a spreadsheet: a scene's shots as rows, every word editable in place. A row opens the shot
// (or its takes, when it's waiting for a pick) unless shots are being picked, when it picks the row.
export function ShotTable({ v, sc, shots, act, characters, nums, selecting, selected, onToggle, onOpen, onAdd }) {
  const save = (sh, patch) => act(() => P().editShot(v.id, sc.id, sh.id, patch))
  return (
    <table className="film-table">
      <thead>
        <tr>
          {selecting && <th className="film-sel" />}
          <th className="film-n">№</th>
          <th className="film-thumb-h" />
          <th>What happens</th>
          <th>Camera</th>
          <th>Who</th>
          <th>The line</th>
          <th className="film-secs">Sec</th>
          <th>Character</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        {shots.map((sh) => {
          const [label, tone] = FILM_STATE[sh.state?.status] || FILM_STATE.draft
          const on = selected.has(sh.id)
          return (
            <tr key={sh.id} className={`film-row ${on ? 'on' : ''}`} onClick={() => (selecting ? onToggle(sh.id) : onOpen(sh))}>
              {selecting && (
                <td className="film-sel">
                  <input type="checkbox" checked={on} aria-label={`Pick shot ${nums.get(sh.id)}`} onChange={() => onToggle(sh.id)} onClick={(e) => e.stopPropagation()} />
                </td>
              )}
              <td className="mono small dim">{nums.get(sh.id)}</td>
              <td className="film-thumb">{sh.sketch ? <img src={fileUrl(sh.sketch)} alt="" loading="lazy" /> : <span className="dim">—</span>}</td>
              <td>
                <Cell area value={sh.action} placeholder="Say what happens." onCommit={(x) => save(sh, { action: x })} />
              </td>
              <td>
                <Cell value={sh.camera} onCommit={(x) => save(sh, { camera: x })} />
              </td>
              <td>
                <Cell value={sh.speaker} placeholder="—" onCommit={(x) => save(sh, { speaker: x })} />
              </td>
              <td>
                <Cell value={sh.line} placeholder="—" title="Changing the words drops the recorded voice line" onCommit={(x) => save(sh, { line: x })} />
              </td>
              <td className="film-secs">
                <Cell type="number" value={sh.seconds} onCommit={(x) => save(sh, { seconds: x })} />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <select value={sh.character || 'none'} aria-label="Character" onChange={(e) => save(sh, { character: e.target.value })}>
                  <option value="none">No one</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <span className={`wiz-panel-state ${tone}`}>{sh.state?.status === 'pick' ? `${label} · ${sh.state.candidates.length}` : label}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
      {onAdd && (
        <tfoot>
          <tr>
            <td colSpan={selecting ? 10 : 9}>
              <button className="link-btn mono small" onClick={onAdd}>
                + Add a shot
              </button>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

// Every spoken line in the film, one row each: who says it, the words, whether its voice is said, and where it
// stands. The words edit in place (new words drop the recorded voice line, as on the board).
export function LinesTable({ v, scenes, act, characters, nums, onOpen }) {
  const rows = scenes.flatMap((sc) => {
    const k = v.scenes.findIndex((s) => s.id === sc.id)
    return sc.shots.filter((sh) => sh.line || sh.speaker).map((sh) => ({ sc, sh, k }))
  })
  const voiced = rows.filter(({ sh }) => sh.voiceLine).length
  if (!rows.length) return <p className="dim film-lines-blank">No lines yet. A shot gets one when the script gives someone something to say.</p>
  return (
    <>
      <p className="mono small dim film-lines-head">
        {plural(rows.length, 'line')} · {voiced} with a voice
      </p>
      <table className="film-table film-lines">
        <thead>
          <tr>
            <th className="film-n">№</th>
            <th>Scene</th>
            <th>Who</th>
            <th>The line</th>
            <th>Voice</th>
            <th className="film-secs">Sec</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sc, sh, k }) => {
            const [label, tone] = FILM_STATE[sh.state?.status] || FILM_STATE.draft
            const ch = characters.find((c) => c.id === sh.character)
            return (
              <tr key={sh.id} className="film-row" onClick={() => onOpen(sc, sh)}>
                <td className="mono small dim">{nums.get(sh.id)}</td>
                <td className="mono small dim" title={sc.location || sc.heading}>
                  S{k + 1}
                </td>
                <td>
                  <Cell value={sh.speaker} placeholder="Someone" onCommit={(x) => act(() => P().editShot(v.id, sc.id, sh.id, { speaker: x }))} />
                </td>
                <td>
                  <Cell value={sh.line} title="Changing the words drops the recorded voice line" onCommit={(x) => act(() => P().editShot(v.id, sc.id, sh.id, { line: x }))} />
                </td>
                <td className="mono small" title={sh.voiceLine ? `Said${sh.voiceLine.heard ? `: “${sh.voiceLine.heard}”` : ''}` : ch?.voiceId ? 'Said when the shot is filmed' : 'Give this character a voice on Audio → Voices'}>
                  {sh.voiceLine ? <span className="film-tone-ok">✓ {Math.round(sh.voiceLine.duration || 0)}s</span> : ch?.voiceId ? <span className="dim">not said</span> : <span className="dim">no voice</span>}
                </td>
                <td className="mono small dim film-secs">{sh.seconds}</td>
                <td>
                  <span className={`wiz-panel-state ${tone}`}>{label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

// The bar that floats up while shots are picked: film them, sketch them or delete them, all at once.
export function BulkBar({ film, shots, previews, onAll, onFilm, onSketch, onDelete, onClear }) {
  if (!shots.length) return null
  const filmable = shots.filter((s) => (s.prompt || '').trim())
  return (
    <div className="film-bulk" role="region" aria-label="Picked shots">
      <span className="mono small">
        {plural(shots.length, 'shot')} picked · {clock(shots.reduce((n, s) => n + s.seconds, 0))}
      </span>
      <button className="link-btn mono small" onClick={onAll}>
        Pick all shown
      </button>
      <span className="film-bulk-act">
        {film ? (
          <button className="btn btn-small btn-primary" disabled={!filmable.length} title={filmable.length ? '' : 'None of the picked shots has a prompt yet'} onClick={onFilm}>
            Film them{filmable.length ? ` · about ${estimate(filmable, previews)} min` : ''}
          </button>
        ) : (
          <button className="btn btn-small" disabled={!filmable.length} title="A sketch for each picked shot that has none" onClick={onSketch}>
            Sketch them
          </button>
        )}
        <button className="btn btn-small" onClick={onDelete}>
          Delete
        </button>
        <button className="link-btn mono small" onClick={onClear}>
          Clear
        </button>
      </span>
    </div>
  )
}
