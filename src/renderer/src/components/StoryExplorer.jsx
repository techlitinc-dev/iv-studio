import { useEffect, useRef, useState } from 'react'
import { fileUrl } from './edit/model'
import Stage from './Stage'

// Story explorer (its own sidebar page): the whole film as a story-development desk — a navigator (acts →
// sequences → scenes → shots, with dialogue lines and what exists for each shot), document tabs (Concept,
// Synopsis, Outline, Screenplay, Notes), an assistant that answers about the story with the person's own writer,
// and the bottom deck: story timeline with a ruler, scene list, character arcs, jobs and reports.
// Data: storymap.explore's tree, features.stats/get, productions.get, features:dashStats, story:assist.
const STATUS_COLOR = { finished: '#7bc47f', filmed: '#e8a06a', written: 'var(--ink-3)' }
// the timeline's block hues, one per act/scene (the reference's coloured strips)
const BLOCK_COLORS = ['#5cc3b2', '#a06bff', '#5b9dff', '#7bc47f', '#e8a06a', '#f44859', '#f19dac', '#e8c06a']
const fmtMin = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `0:${String(Math.round(s)).padStart(2, '0')}`)
const fmtDur = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)
const walk = (nodes, fn) => (nodes || []).flatMap((nd) => (fn(nd) ? [nd] : walk(nd.children, fn)))
const secsOf = (nd) => (nd.kind === 'shot' ? parseInt(nd.sub, 10) || 0 : (nd.children || []).reduce((t, c) => t + secsOf(c), 0))
const shotsOf = (nodes) => walk(nodes, (nd) => nd.kind === 'shot')
const TABS = [
  ['concept', 'Concept'],
  ['synopsis', 'Synopsis'],
  ['outline', 'Outline'],
  ['screenplay', 'Screenplay'],
  ['notes', 'Notes']
]
const BOTTOM_TABS = [
  ['timeline', 'Story timeline'],
  ['scenes', 'Scene list'],
  ['characters', 'Characters arc'],
  ['jobs', 'Jobs'],
  ['reports', 'Reports']
]
const QUICK = [
  ['improve', 'Improve this scene'],
  ['dialogue', 'Rewrite dialogue'],
  ['expand', 'Expand the scene'],
  ['continuity', 'Check continuity'],
  ['next', 'Suggest next scene'],
  ['analyze', 'Analyze story structure']
]

export default function StoryExplorer({ notify, openStoryMap, openProject, openShot }) {
  const [items, setItems] = useState([])
  const [sel, setSel] = useState('')
  const [tree, setTree] = useState(null)
  const [stats, setStats] = useState(null)
  const [prod, setProd] = useState(null)
  const [feature, setFeature] = useState(null) // the full feature record, for editing Concept
  const [tab, setTab] = useState('concept')
  const [btab, setBtab] = useState('timeline')
  const [filter, setFilter] = useState('')
  const [actFilter, setActFilter] = useState('all')
  const [collapsed, setCollapsed] = useState(null) // Set of node ids; null = auto (scenes fold when the story is big)
  const [sceneId, setSceneId] = useState(null) // the scene open in the center / the assistant's context
  const [draft, setDraft] = useState(null) // Concept edits { logline, story }
  const [script, setScript] = useState(null) // the Screenplay tab's text, loaded lazily
  const [notes, setNotes] = useState('')
  const [dash, setDash] = useState(null) // features:dashStats, for the Jobs tab
  const [log, setLog] = useState([]) // the assistant's [{ q, a }]
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [zoom, setZoom] = useState(1)
  // the timeline's scene filter: 'all' plays the whole story; a scene id zooms the timeline (and the player) to it
  const [tlScene, setTlScene] = useState('all')
  // the playable timeline: a playhead that crosses the blocks in real time, playing each shot's footage
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [rate, setRate] = useState(1)
  const vidRef = useRef(null)
  const kind = sel.split(':')[0]
  const id = sel.split(':')[1]
  const mapKind = kind === 'project' ? 'production' : kind

  useEffect(() => {
    ;(async () => {
      const [fs, ps] = await Promise.all([window.ivstudio.features.list().catch(() => []), window.ivstudio.productions.list().catch(() => [])])
      const full = await Promise.all(fs.map((f) => window.ivstudio.features.get(f.id).catch(() => null)))
      const inFeature = new Set(full.filter(Boolean).flatMap((f) => (f.sequences || []).map((s) => s.id)))
      const list = [
        ...fs.map((f) => ({ key: `feature:${f.id}`, name: f.name, group: 'Feature films' })),
        ...ps.filter((p) => !inFeature.has(p.id)).map((p) => ({ key: `project:${p.id}`, name: p.name, group: 'Projects' }))
      ]
      setItems(list)
      if (list.length) setSel((v) => v || list[0].key)
    })()
  }, [])
  useEffect(() => {
    if (!sel) return
    setTree(null)
    setSceneId(null)
    setDraft(null)
    setScript(null)
    setLog([])
    window.ivstudio.storymap.explore({ kind: mapKind, id }).then(setTree, (e) => notify(e.message))
    if (kind === 'feature') {
      setProd(null)
      window.ivstudio.features.stats(id).then(setStats, () => setStats(null))
      window.ivstudio.features.get(id).then(setFeature, () => setFeature(null))
      window.ivstudio.features.dashStats(id).then(setDash, () => setDash(null))
    } else {
      setStats(null)
      setFeature(null)
      setDash(null)
      window.ivstudio.productions.get(id).then(setProd, () => setProd(null))
    }
    setNotes(localStorage.getItem(`iv.storynotes.${sel}`) || '')
  }, [sel])
  // the Screenplay tab loads its text when first opened
  useEffect(() => {
    if (tab !== 'screenplay' || script !== null || !sel) return
    ;(async () => {
      if (kind === 'project') return setScript(prod?.script?.text || '(no script written yet)')
      const f = await window.ivstudio.features.get(id).catch(() => null)
      if (!f) return setScript('(no script written yet)')
      const parts = []
      for (const seq of f.sequences || []) {
        const p = await window.ivstudio.productions.get(seq.id).catch(() => null)
        if (p?.script?.text) parts.push(`### ${seq.title}\n\n${p.script.text}`)
      }
      setScript(parts.join('\n\n') || '(no script written yet)')
    })()
  }, [tab, sel, prod])

  const shots = shotsOf(tree?.children)
  const finishedShots = shots.filter((s) => s.status === 'finished')
  const footage = finishedShots.reduce((t, s) => t + (parseInt(s.sub, 10) || 0), 0)
  const target = kind === 'feature' ? stats?.targetSeconds ?? 0 : Math.round(prod?.targetSeconds || 0)
  const scenes = walk(tree?.children, (nd) => nd.kind === 'scene')
  const sequences = walk(tree?.children, (nd) => nd.kind === 'sequence')
  const acts = (tree?.children || []).filter((n) => n.kind === 'act')
  const scene = sceneId ? scenes.find((s) => s.id === sceneId) : null
  // the playlist: the story's shots in order (or one scene's, when the timeline is filtered to it), each with
  // its span on the clock and its footage
  const tlShots = tlScene === 'all' ? shots : shotsOf([scenes.find((s) => s.id === tlScene)].filter(Boolean))
  const playlist = (() => {
    let t = 0
    return tlShots.map((s) => {
      const len = Math.max(0.5, parseInt(s.sub, 10) || 0)
      const item = { id: s.id, title: s.title, start: t, end: t + len, video: s.video || null, status: s.status }
      t += len
      return item
    })
  })()
  const total = playlist.length ? playlist[playlist.length - 1].end : 0
  const active = playlist.find((p) => time >= p.start && time < p.end) || playlist[playlist.length - 1] || null
  const srcOf = (v) => (/^https?:/i.test(v) ? v : fileUrl(v))
  // the clock: a tick four times a second, rate-scaled; stops at the story's end
  useEffect(() => {
    if (!playing) return
    const iv = setInterval(
      () =>
        setTime((t) => {
          const next = t + 0.25 * rate
          if (next >= total) {
            setPlaying(false)
            return total
          }
          return next
        }),
      250
    )
    return () => clearInterval(iv)
  }, [playing, rate, total])
  // a new story resets the playhead and the scene filter
  useEffect(() => {
    setPlaying(false)
    setTime(0)
    setTlScene('all')
  }, [sel])
  // so does a new scene filter
  useEffect(() => {
    setPlaying(false)
    setTime(0)
  }, [tlScene])
  // the footage follows the playhead: the active shot's video plays/pauses/rates with the clock
  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    v.playbackRate = rate
    if (playing) v.play().catch(() => {})
    else v.pause()
  }, [playing, rate, active?.id])
  const stats2 = [
    ['Target runtime', target ? `${fmtMin(target)} min` : '—'],
    ['Current runtime', `${fmtMin(footage)} min`],
    ['Over / under', target ? `${footage - target >= 0 ? '+' : '−'}${fmtMin(Math.abs(footage - target))} min` : '—'],
    ['Acts', kind === 'feature' ? String(acts.length) : '—'],
    ['Sequences', kind === 'feature' ? String(sequences.length) : '—'],
    ['Total scenes', String(scenes.length)],
    ['Shots', String(shots.length)],
    ['Finished', shots.length ? `${Math.round((finishedShots.length / shots.length) * 100)}%` : '—']
  ]
  // the navigator tree, filtered by the text box and the act dropdown (ancestors of a match stay)
  const matches = (nd, q) => !q || `${nd.title} ${nd.sub || ''} ${nd.body || ''}`.toLowerCase().includes(q)
  const keep = (nd, q) => matches(nd, q) || (nd.children || []).some((c) => keep(c, q))
  const navTree = (tree?.children || []).filter((a) => (actFilter === 'all' || a.id === actFilter) && keep(a, filter.toLowerCase().trim()))
  // collapsing: with a big story (60+ shots) scenes start folded, so 100 scenes / 1000 shots stay manageable
  const parents = (() => {
    const m = new Map()
    const walkP = (nds, p) => (nds || []).forEach((nd) => (m.set(nd.id, p), walkP(nd.children, nd.id)))
    walkP(tree?.children, null)
    return m
  })()
  const autoCollapsed = () => new Set(shots.length > 60 ? scenes.map((s) => s.id) : [])
  const isCollapsed = (nid) => (collapsed ?? autoCollapsed()).has(nid)
  const toggleCollapse = (nid) =>
    setCollapsed((c) => {
      const next = new Set(c ?? autoCollapsed())
      next.has(nid) ? next.delete(nid) : next.add(nid)
      return next
    })
  const expandAll = () => setCollapsed(new Set())
  const foldAll = () => setCollapsed(new Set([...acts, ...sequences, ...scenes].map((n) => n.id)))
  // jump to a scene: unfold its ancestors, open it in the center, scroll it into view
  const jumpTo = (nid) => {
    setCollapsed((c) => {
      const next = new Set(c ?? autoCollapsed())
      let p = parents.get(nid)
      while (p) {
        next.delete(p)
        p = parents.get(p)
      }
      return next
    })
    setSceneId(nid)
    setTimeout(() => document.getElementById(`sx-n-${nid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
  }
  const node = (nd, depth) => (
    <div key={nd.id} className={`sx-node sx-${nd.kind}`} id={`sx-n-${nd.id}`}>
      <div
        className={`sx-row ${nd.id === sceneId ? 'on' : ''}`}
        style={{ '--depth': depth }}
        onClick={nd.kind === 'scene' ? () => setSceneId(nd.id === sceneId ? null : nd.id) : nd.link?.production ? () => openProject?.(nd.link.production) : nd.projectId ? () => openShot?.(nd.projectId) : undefined}
        role={nd.kind === 'scene' || nd.link?.production || nd.projectId ? 'button' : undefined}
      >
        {(nd.children || []).length > 0 && (
          <button className="sx-chev" aria-label={isCollapsed(nd.id) ? 'Expand' : 'Fold'} onClick={(e) => (e.stopPropagation(), toggleCollapse(nd.id))}>
            {isCollapsed(nd.id) ? '▸' : '▾'}
          </button>
        )}
        {nd.kind === 'shot' && <span className="sx-dot" style={{ background: STATUS_COLOR[nd.status] || STATUS_COLOR.written }} />}
        <span className="sx-title">{nd.title}</span>
        <span className="sx-meta dim small">{[nd.meta, nd.sub].filter(Boolean).join(' · ')}</span>
      </div>
      {nd.kind === 'shot' && !isCollapsed(nd.id) && (nd.body || nd.sketch || nd.takes > 0 || nd.sound) && (
        <div className="sx-artifacts" style={{ '--depth': depth + 1 }}>
          {nd.body && <span className="sx-art small dim">“{nd.body}”</span>}
          {nd.sketch && <span className="sx-art mono small">storyboard</span>}
          {nd.takes > 0 && <span className="sx-art mono small">{nd.takes} take{nd.takes > 1 ? 's' : ''}</span>}
          {nd.sound && <span className="sx-art mono small">sound</span>}
        </div>
      )}
      {!isCollapsed(nd.id) && (nd.children || []).map((c) => node(c, depth + 1))}
    </div>
  )
  // the timeline's blocks: acts (features) or scenes (projects), sized by their shots' actual seconds, so the
  // playhead crosses a boundary exactly when the story moves on (planned minutes stay in the tooltip). Filtered
  // to a scene, the timeline is that one scene, its shots as the parts.
  const sceneBlock = (sc, i) => {
    const ss = shotsOf([sc])
    return { id: sc.id, title: sc.title, color: BLOCK_COLORS[i % BLOCK_COLORS.length], weight: Math.max(1, secsOf(sc)), meta: `${ss.length} shots · ${fmtMin(secsOf(sc))} min`, fill: ss.length ? ss.filter((x) => x.status === 'finished').length / ss.length : 0, parts: ss.map((s) => ({ id: s.id, title: s.title, weight: Math.max(1, parseInt(s.sub, 10) || 1), fill: s.status === 'finished' ? 1 : 0, status: s.status })) }
  }
  const blocks =
    tlScene !== 'all'
      ? scenes.filter((s) => s.id === tlScene).map(sceneBlock)
      : kind === 'feature'
        ? (stats?.acts || []).map((a, i) => {
            const actNode = acts.find((n) => n.id === `a:${a.id}`)
            const seqs = actNode?.children || []
            return { id: a.id, title: a.title, color: BLOCK_COLORS[i % BLOCK_COLORS.length], weight: Math.max(1, secsOf(actNode)), meta: `${a.minutes} min planned · ${a.finished}/${a.shots} shots`, fill: a.shots ? a.finished / a.shots : 0, parts: seqs.map((s) => ({ id: s.id, title: s.title, weight: Math.max(1, secsOf(s)), fill: (() => { const ss = shotsOf([s]); return ss.length ? ss.filter((x) => x.status === 'finished').length / ss.length : 0 })() })) }
          })
        : (tree?.children || []).map(sceneBlock)
  // character arcs: who appears in which scenes
  const arcs = (() => {
    const map = new Map()
    for (const sc of scenes) for (const sh of sc.children || []) for (const w of sh.who || []) {
      if (!map.has(w)) map.set(w, new Set())
      map.get(w).add(sc.id)
    }
    return [...map.entries()].map(([name, set]) => ({ name, scenes: set })).sort((a, b) => b.scenes.size - a.scenes.size)
  })()
  async function ask(action, q = null) {
    if (busy) return
    setBusy(true)
    try {
      const r = await window.ivstudio.storymap.assist({ kind: mapKind, id, action, question: q, sceneId })
      setLog((l) => [...l, { q: q || QUICK.find(([a]) => a === action)?.[1] || action, a: r.text }])
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function saveConcept() {
    try {
      await window.ivstudio.features.update(id, draft)
      setFeature((f) => ({ ...f, ...draft }))
      setDraft(null)
      notify('Saved.', 'info')
    } catch (err) {
      notify(err.message)
    }
  }
  const report = () => {
    const lines = [
      `Structure: ${kind === 'feature' ? `${acts.length} acts, ${sequences.length} sequences, ` : ''}${scenes.length} scenes, ${shots.length} shots.`,
      `Runtime: ${fmtMin(footage)} min of footage against a ${fmtMin(target)} min target${target ? ` (${footage - target >= 0 ? `${fmtMin(footage - target)} over` : `${fmtMin(target - footage)} under`})` : ''}.`,
      `Progress: ${finishedShots.length} of ${shots.length} shots finished (${shots.length ? Math.round((finishedShots.length / shots.length) * 100) : 0}%).`,
      arcs.length ? `Characters: ${arcs.map((a) => `${a.name} (${a.scenes.size})`).join(', ')}.` : 'No characters written into the shots yet.',
      dash ? `Renders: ${dash.renders.jobs} jobs (${dash.renders.previews} hunts, ${dash.renders.finishes} finishes${dash.renders.failed ? `, ${dash.renders.failed} failed` : ''}), ${fmtDur(dash.renders.seconds)} of GPU time.` : null,
      scenes.filter((sc) => !(sc.children || []).length).length ? `Watch out: ${scenes.filter((sc) => !(sc.children || []).length).length} scene(s) have no shots yet.` : null,
      target && footage > target ? `Watch out: the footage is ${fmtMin(footage - target)} over target — the timeline shows where the weight sits.` : null
    ].filter(Boolean)
    return lines
  }
  const typeLine = kind === 'feature' ? (feature ? `Feature film · ${feature.targetMinutes} min · ${feature.aspect} · ${feature.video === 'seedance' ? 'Seedance 2.5' : 'MiniMax H3'} · ${feature.speed} speed` : '…') : prod ? `Short film · ${Math.round(prod.targetSeconds || 0)}s target · ${prod.aspect || '16:9'}` : '…'

  return (
    <div className="story-explorer">
      <Stage effect="halo" art="storymap" title="Story explorer" kicker="The whole film, structured">
        <label className="previz-character small">
          Story{' '}
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {[...new Set(items.map((f) => f.group))].map((g) => (
              <optgroup key={g} label={g}>
                {items.filter((f) => f.group === g).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {sel && (
          <button className="btn btn-small" onClick={() => openStoryMap?.(mapKind, id)}>
            Open the mind map
          </button>
        )}
      </Stage>

      {!tree && <p className="dim small">Loading the story…</p>}
      {tree && (
        <>
          <div className="sx2-main">
            <aside className="sx2-nav">
              <div className="sx2-nav-head">
                <input type="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter the navigator" />
                {kind === 'feature' && (
                  <select value={actFilter} onChange={(e) => setActFilter(e.target.value)} aria-label="Act">
                    <option value="all">All acts</option>
                    {acts.map((a, i) => (
                      <option key={a.id} value={a.id}>
                        Act {i + 1} · {a.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="sx2-nav-head">
                <select value="" onChange={(e) => e.target.value && jumpTo(e.target.value)} aria-label="Jump to a scene">
                  <option value="">Jump to a scene…</option>
                  {scenes.map((sc) => {
                    const parent = parents.get(sc.id)
                    const parentNode = parent ? sequences.find((s) => s.id === parent) || acts.find((a) => a.id === parent) : null
                    return (
                      <option key={sc.id} value={sc.id}>
                        {parentNode ? `${parentNode.title} — ` : ''}
                        {sc.title}
                      </option>
                    )
                  })}
                </select>
                <button className="link-btn small" onClick={expandAll}>
                  Unfold all
                </button>
                <button className="link-btn small" onClick={foldAll}>
                  Fold all
                </button>
              </div>
              <div className="sx-tree">{navTree.map((c) => node(c, 0))}</div>
            </aside>

            <section className="sx2-center">
              {scene ? (
                <div className="sx2-doc">
                  <div className="sx2-doc-head">
                    <h3>{scene.title}</h3>
                    <button className="link-btn small" onClick={() => setSceneId(null)}>
                      × Close
                    </button>
                  </div>
                  <p className="small dim">
                    {scene.sub ? `${scene.sub} · ` : ''}
                    {(scene.children || []).length} shots · {fmtMin(secsOf(scene))} min
                    {scene.link?.production && (
                      <>
                        {' · '}
                        <button className="link-btn small" onClick={() => openProject?.(scene.link.production)}>
                          Open the project
                        </button>
                      </>
                    )}
                  </p>
                  {(scene.children || []).map((sh) => (
                    <div key={sh.id} className="sx2-scene-shot small">
                      <span className="sx-dot" style={{ background: STATUS_COLOR[sh.status] }} />
                      <span>
                        {sh.title} <span className="dim">· {sh.sub}{sh.meta ? ` · ${sh.meta}` : ''}</span>
                        {sh.body && <span className="dim"> — “{sh.body}”</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sx2-doc">
                  <div className="sx2-tabs" role="tablist">
                    {TABS.map(([t, label]) => (
                      <button key={t} role="tab" aria-selected={tab === t} className={`sx2-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {tab === 'concept' && (
                    <div className="sx2-concept">
                      <p className="mono small dim">Type</p>
                      <p className="small">{typeLine}</p>
                      <p className="mono small dim">Brief</p>
                      {kind === 'feature' && feature ? (
                        <textarea rows={2} value={draft?.logline ?? feature.logline ?? ''} onChange={(e) => setDraft((d) => ({ logline: feature.logline, story: feature.story, ...(d || {}), logline: e.target.value }))} />
                      ) : (
                        <p className="small">{prod?.logline || tree.root.sub || '—'}</p>
                      )}
                      <p className="mono small dim">Premise</p>
                      {kind === 'feature' && feature ? (
                        <textarea rows={6} value={draft?.story ?? feature.story ?? ''} onChange={(e) => setDraft((d) => ({ logline: feature.logline, story: feature.story, ...(d || {}), story: e.target.value }))} />
                      ) : (
                        <p className="small sx2-pre">{prod?.script?.text?.split('\n').slice(0, 10).join('\n') || '—'}</p>
                      )}
                      {kind === 'feature' && feature && (
                        <div className="media-actions">
                          <button className="btn btn-small btn-primary" disabled={!draft} onClick={saveConcept}>
                            Save premise
                          </button>
                          {draft && (
                            <button className="link-btn small" onClick={() => setDraft(null)}>
                              Discard
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {tab === 'synopsis' && <p className="small sx2-pre">{kind === 'feature' ? feature?.story || tree.root.body || '(no synopsis yet)' : tree.root.body || prod?.logline || '(no synopsis yet)'}</p>}
                  {tab === 'outline' && <div className="sx-tree sx-outline">{tree.children?.map((c) => node(c, 0))}</div>}
                  {tab === 'screenplay' && <p className="small sx2-pre">{script ?? 'Loading the script…'}</p>}
                  {tab === 'notes' && (
                    <textarea
                      rows={10}
                      placeholder="Your notes on this story — kept on this PC."
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value)
                        localStorage.setItem(`iv.storynotes.${sel}`, e.target.value)
                      }}
                    />
                  )}
                </div>
              )}
            </section>

            <aside className="sx2-assist">
              <p className="mono small dim">AI story assistant</p>
              <p className="small dim">About: {scene ? scene.title : 'the whole story'}. Uses your prompt writer.</p>
              <div className="sx2-quick">
                {QUICK.map(([a, label]) => (
                  <button key={a} className="btn btn-small" disabled={busy} onClick={() => ask(a)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="sx2-log">
                {log.map((m, i) => (
                  <div key={i} className="sx2-msg">
                    <p className="small mono dim">{m.q}</p>
                    <p className="small sx2-pre">{m.a}</p>
                  </div>
                ))}
                {busy && <p className="small dim">Thinking…</p>}
                {!log.length && !busy && <p className="small dim">How can I help with your story?</p>}
              </div>
              <div className="sx2-ask">
                <input
                  value={question}
                  placeholder="Ask anything about your story…"
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && question.trim()) {
                      ask(null, question.trim())
                      setQuestion('')
                    }
                  }}
                />
                <button
                  className="btn btn-small btn-primary"
                  disabled={busy || !question.trim()}
                  onClick={() => {
                    ask(null, question.trim())
                    setQuestion('')
                  }}
                >
                  Ask
                </button>
              </div>
            </aside>
          </div>

          <div className="sx2-bottom">
            <div className="sx-stats">
              {stats2.map(([k, v]) => (
                <div key={k} className="sx-stat">
                  <span className="mono small dim">{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <div className="sx2-tabs" role="tablist">
              {BOTTOM_TABS.map(([t, label]) => (
                <button key={t} role="tab" aria-selected={btab === t} className={`sx2-tab ${btab === t ? 'on' : ''}`} onClick={() => setBtab(t)}>
                  {label}
                </button>
              ))}
              {btab === 'timeline' && (
                <span className="sx2-zoom">
                  <button className={`link-btn small ${zoom === 1 ? 'on' : ''}`} onClick={() => setZoom(1)}>
                    100%
                  </button>
                  <button className={`link-btn small ${zoom === 2 ? 'on' : ''}`} onClick={() => setZoom(2)}>
                    200%
                  </button>
                </span>
              )}
            </div>
            {btab === 'timeline' && (
              <>
                <div className="sx-player">
                  <button className="btn btn-small" disabled={!total} onClick={() => (time >= total ? (setTime(0), setPlaying(true)) : setPlaying((p) => !p))}>
                    {playing ? '❚❚ Pause' : '▶ Play'}
                  </button>
                  <span className="mono small">
                    {fmtMin(time)} / {fmtMin(total)}
                  </span>
                  <button className="link-btn small" onClick={() => setRate((r) => (r === 1 ? 4 : 1))} title="Playback speed">
                    {rate}×
                  </button>
                  <select value={tlScene} onChange={(e) => setTlScene(e.target.value)} aria-label="Timeline scope" className="sx-scope">
                    <option value="all">Whole story</option>
                    {scenes.map((sc) => {
                      const parent = parents.get(sc.id)
                      const parentNode = parent ? sequences.find((s) => s.id === parent) || acts.find((a) => a.id === parent) : null
                      return (
                        <option key={sc.id} value={sc.id}>
                          {parentNode ? `${parentNode.title} — ` : ''}
                          {sc.title}
                        </option>
                      )
                    })}
                  </select>
                  {active && (
                    <span className="small dim sx-player-title">
                      {active.title}
                      {active.video ? '' : ' · no footage yet'}
                    </span>
                  )}
                </div>
                {active && (
                  <div className="sx-screen">
                    {active.video ? (
                      <video
                        key={active.id}
                        ref={vidRef}
                        src={srcOf(active.video)}
                        playsInline
                        onLoadedMetadata={(e) => {
                          e.target.currentTime = Math.min(e.target.duration || 0, Math.max(0, time - active.start))
                          if (playing) e.target.play().catch(() => {})
                        }}
                      />
                    ) : (
                      <div className="sx-screen-empty">
                        <span>{active.title}</span>
                        <span className="dim small">{active.status} — no footage yet</span>
                      </div>
                    )}
                  </div>
                )}
                {total > 0 && (
                  <div className="sx-ruler">
                    {(() => {
                      const step = total > 3600 ? 600 : total > 1200 ? 300 : total > 300 ? 60 : 30
                      return Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => (
                        <span key={i} className="sx-ruler-mark mono dim" style={{ left: `${((i * step) / total) * 100}%` }}>
                          {fmtMin(i * step)}
                        </span>
                      ))
                    })()}
                  </div>
                )}
                <div
                  className="sx-timeline playable"
                  style={{ minWidth: `${zoom * 100}%` }}
                  onClick={(e) => {
                    if (!total) return
                    const r = e.currentTarget.getBoundingClientRect()
                    setTime(Math.min(total, Math.max(0, ((e.clientX - r.left) / r.width) * total)))
                  }}
                >
                  {total > 0 && <span className="sx-playhead" style={{ left: `${(time / total) * 100}%` }} />}
                  {blocks.map((b) => (
                    <div key={b.id} className="sx-block" style={{ flexGrow: b.weight, minWidth: 90 * zoom, borderTopColor: b.color }} title={`${b.title} — ${b.meta} · ${Math.round(b.fill * 100)}% finished`}>
                      <div className="sx-block-head mono small">
                        <span className="sx-block-name" style={{ color: b.color }}>
                          {b.title}
                        </span>
                        <span className="dim">{Math.round(b.fill * 100)}%</span>
                      </div>
                      <div className="sx-parts">
                        {b.parts.map((p) => (
                          <span key={p.id} className="sx-part" style={{ flexGrow: p.weight, background: `${b.color}26` }} title={`${p.title}${p.status ? ` · ${p.status}` : ''}`}>
                            <span className="sx-part-fill" style={{ width: `${p.fill * 100}%`, background: p.status === 'filmed' ? STATUS_COLOR.filmed : p.status === 'written' ? STATUS_COLOR.written : b.color }} />
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!blocks.length && <p className="dim small">Nothing structured yet — write the story first.</p>}
                </div>
                <p className="small dim mdash-legend">▶ plays the story: each shot's footage as the playhead crosses it (shots without footage show as cards) · click the timeline to jump · block width = screen time · fill = finished footage</p>
              </>
            )}
            {btab === 'scenes' && (
              <table className="mdash-table">
                <thead>
                  <tr className="mono small dim">
                    <th>Scene</th>
                    <th>Where</th>
                    <th>Shots</th>
                    <th>Time</th>
                    <th>Finished</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((sc) => {
                    const ss = sc.children || []
                    const fin = ss.filter((x) => x.status === 'finished').length
                    const pct = ss.length ? Math.round((fin / ss.length) * 100) : 0
                    return (
                      <tr key={sc.id} className="small">
                        <td>{sc.title}</td>
                        <td className="dim">{sc.sub || '—'}</td>
                        <td>{ss.length}</td>
                        <td>{fmtMin(secsOf(sc))}</td>
                        <td>
                          {fin}/{ss.length}
                        </td>
                        <td>
                          <span className="mdash-cell-bar">
                            <span style={{ width: `${pct}%` }} />
                          </span>{' '}
                          <span className="dim">{pct}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {btab === 'characters' &&
              (arcs.length ? (
                <table className="mdash-table sx-arcs">
                  <thead>
                    <tr className="mono small dim">
                      <th>Character</th>
                      {scenes.map((sc) => (
                        <th key={sc.id} title={sc.title}>
                          {sc.title.replace(/^SC-\d+\s*/i, '').slice(0, 8)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {arcs.map((a) => (
                      <tr key={a.name} className="small">
                        <td>{a.name}</td>
                        {scenes.map((sc) => (
                          <td key={sc.id}>{a.scenes.has(sc.id) ? <span className="sx-dot" style={{ background: 'var(--pink)' }} /> : ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="small dim">No characters written into the shots yet.</p>
              ))}
            {btab === 'jobs' &&
              (dash ? (
                <div className="sx-stats">
                  {[
                    ['Render jobs', String(dash.renders.jobs)],
                    ['Hunts', String(dash.renders.previews)],
                    ['Finishes', String(dash.renders.finishes)],
                    ['Failed', String(dash.renders.failed)],
                    ['GPU time', fmtDur(dash.renders.seconds)],
                    ['Cloud', fmtDur(dash.renders.cloudSeconds)],
                    ['This PC', fmtDur(dash.renders.localSeconds)]
                  ].map(([k, v]) => (
                    <div key={k} className="sx-stat">
                      <span className="mono small dim">{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small dim">Render numbers are counted for feature films.</p>
              ))}
            {btab === 'reports' && (
              <div className="sx2-report">
                {report().map((l, i) => (
                  <p key={i} className="small">
                    {l}
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
