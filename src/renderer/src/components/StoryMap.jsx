import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// The story explorer, now for everything (service/storymap.js): a feature film, a short film (Project) or a
// song — one recursive tree, one renderer. Click a node for its full contents in the detail panel; drag nodes
// to rearrange (kept per item); double-click opens what it is (a sequence or scene its Project, a shot its
// renders, a remix its song); scroll zooms at the cursor; left-drag pans; ▸/▾ collapses.
const STATUS = {
  written: { label: 'Written', color: '#8a8288' },
  filmed: { label: 'Filmed', color: '#e0b34d' },
  finished: { label: 'Finished', color: '#7fc98f' }
}
const BACK = { feature: ['features', '← Features'], production: ['projects', '← Projects'], song: ['music', '← Music'] }
const saved = (key) => {
  try {
    return JSON.parse(localStorage.getItem(`iv.storymap.${key}`) || 'null')
  } catch {
    return null
  }
}

export default function StoryMap({ kind, id, go, notify, openShot, openProject }) {
  const key = `${kind}:${id}`
  const [data, setData] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set(saved(key)?.collapsed || []))
  const [offsets, setOffsets] = useState(() => saved(key)?.offsets || {})
  const [view, setView] = useState(() => saved(key)?.view || { x: 24, y: 24, k: 1 })
  const [selected, setSelected] = useState(null)
  const viewportRef = useRef(null)
  const canvasRef = useRef(null)
  const svgRef = useRef(null)
  const pan = useRef(null)
  const nodeDrag = useRef(null)

  useEffect(() => {
    setData(null)
    window.ivstudio.storymap
      .explore({ kind, id })
      .then(setData)
      .catch((e) => notify(e.message))
  }, [kind, id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(`iv.storymap.${key}`, JSON.stringify({ view, offsets, collapsed: [...collapsed] }))
    } catch {}
  }, [key, view, offsets, collapsed])

  const drawEdges = useCallback(() => {
    const canvas = canvasRef.current
    const svg = svgRef.current
    if (!canvas || !svg) return
    const base = canvas.getBoundingClientRect()
    const paths = []
    for (const el of canvas.querySelectorAll('[data-child-of]')) {
      const parent = canvas.querySelector(`[data-node="${el.dataset.childOf}"]`)
      if (!parent) continue
      const a = parent.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      const x1 = a.right - base.left
      const y1 = a.top + a.height / 2 - base.top
      const x2 = b.left - base.left
      const y2 = b.top + b.height / 2 - base.top
      const dx = Math.max(24, (x2 - x1) / 2)
      paths.push(`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`)
    }
    svg.setAttribute('viewBox', `0 0 ${canvas.offsetWidth} ${canvas.offsetHeight}`)
    svg.innerHTML = paths.map((d) => `<path class="map-edge" d="${d}"/>`).join('')
  }, [])

  useLayoutEffect(() => {
    drawEdges()
  }, [data, collapsed, offsets, drawEdges])
  useEffect(() => {
    const t = () => drawEdges()
    window.addEventListener('resize', t)
    return () => window.removeEventListener('resize', t)
  }, [drawEdges])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const wheel = (e) => {
      e.preventDefault()
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const r = vp.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.25, v.k * f))
        const kk = k / v.k
        return { k, x: mx - (mx - v.x) * kk, y: my - (my - v.y) * kk }
      })
    }
    vp.addEventListener('wheel', wheel, { passive: false })
    return () => vp.removeEventListener('wheel', wheel)
  }, [])

  const panStart = (e) => {
    if (e.target.closest('.map-node, .map-chip, .map-detail, button, a, input')) return
    pan.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const panMove = (e) => {
    if (!pan.current) return
    const dx = e.clientX - pan.current.x
    const dy = e.clientY - pan.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true
    pan.current = { ...pan.current, x: e.clientX, y: e.clientY }
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  const panEnd = () => {
    if (pan.current && !pan.current.moved) setSelected(null)
    pan.current = null
  }

  const nodeDown = (e, id) => {
    if (e.target.closest('button, a, input')) return
    nodeDrag.current = { id, x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const nodeMove = (e) => {
    const d = nodeDrag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) + Math.abs(dy) <= 4) return
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    const id = d.id
    setOffsets((prev) => ({ ...prev, [id]: { x: (prev[id]?.x || 0) + dx, y: (prev[id]?.y || 0) + dy } }))
  }
  const nodeUp = (id) => {
    if (nodeDrag.current && !nodeDrag.current.moved) setSelected(selected === id ? null : id)
    nodeDrag.current = null
  }
  const at = (id) => {
    const o = offsets[id] || {}
    return { transform: `translate(${o.x || 0}px, ${o.y || 0}px)` }
  }

  const zoomBy = (f) =>
    setView((v) => {
      const vp = viewportRef.current
      const r = vp?.getBoundingClientRect()
      const mx = r ? r.width / 2 : 0
      const my = r ? r.height / 2 : 0
      const k = Math.min(2.5, Math.max(0.25, v.k * f))
      const kk = k / v.k
      return { k, x: mx - (mx - v.x) * kk, y: my - (my - v.y) * kk }
    })
  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const collapseAll = () => setCollapsed(new Set(collectIds(data?.children || [], 2)))
  const expandAll = () => setCollapsed(new Set())

  const find = (id, nodes = data ? [...data.children, data.root] : []) => {
    for (const nd of nodes) {
      if (!nd) continue
      if (nd.id === id) return nd
      const hit = find(id, nd.children || [])
      if (hit) return hit
    }
    return null
  }
  const dbl = (nd, parentLink) => {
    if (!nd) return
    const link = nd.link || parentLink
    if (nd.kind === 'shot') (nd.projectId ? openShot(nd.projectId) : link?.production && openProject(link.production))
    else if (nd.kind === 'song' && nd.link?.song) go('music')
    else if (link?.production) openProject(link.production)
  }

  const [backPage, backLabel] = BACK[kind] || ['home', '← Back']
  const picked = selected ? find(selected) : null

  if (!data) return <div className="map-wrap"><p className="mono dim map-loading">Reading it…</p></div>

  const renderNode = (nd, parentId, parentLink) => {
    const link = nd.link || parentLink
    const isCollapsed = collapsed.has(nd.id)
    const hasKids = (nd.children || []).length > 0
    return (
      <div className="map-branch" key={nd.id}>
        {nd.chip ? (
          <div
            role="button"
            tabIndex={0}
            className={`map-chip ${selected === nd.id ? 'selected' : ''}`}
            style={{ ...at(nd.id), ...(nd.status ? { borderColor: STATUS[nd.status]?.color } : {}) }}
            data-node={nd.id}
            data-child-of={parentId}
            title={[nd.meta, nd.body].filter(Boolean).join('\n')}
            onPointerDown={(e) => nodeDown(e, nd.id)}
            onPointerMove={nodeMove}
            onPointerUp={() => nodeUp(nd.id)}
            onDoubleClick={() => dbl(nd, link)}
            onKeyDown={(e) => e.key === 'Enter' && setSelected(nd.id)}
          >
            <span className="map-chip-title">{nd.title}</span>
            {nd.sub && <span className="mono small dim">{nd.sub}</span>}
          </div>
        ) : (
          <div
            className={`map-node map-${nd.kind} ${selected === nd.id ? 'selected' : ''}`}
            data-node={nd.id}
            data-child-of={parentId}
            style={at(nd.id)}
            onPointerDown={(e) => nodeDown(e, nd.id)}
            onPointerMove={nodeMove}
            onPointerUp={() => nodeUp(nd.id)}
            onDoubleClick={() => dbl(nd, link)}
          >
            <div className="map-node-head">
              {hasKids && (
                <button className="map-fold mono" onClick={() => toggle(nd.id)} aria-expanded={!isCollapsed} title={isCollapsed ? 'Show inside' : 'Hide inside'}>
                  {isCollapsed ? '▸' : '▾'}
                </button>
              )}
              <div>
                {nd.kind !== 'line' && <p className={`mono small ${nd.kind === 'root' ? '' : 'dim'}`}>{nd.kind === 'root' ? labelFor(nd, data.kind) : nd.meta || nd.kind}</p>}
                <h4>{nd.title}</h4>
                {nd.sub && <p className="small dim">{nd.sub}</p>}
              </div>
            </div>
          </div>
        )}
        {hasKids && !isCollapsed && (
          <div className={`map-col ${nd.children[0]?.chip ? 'map-chips' : ''}`} data-child-of={nd.id}>
            {nd.children.map((ch) => renderNode(ch, nd.id, link))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        <button className="link-btn mono" onClick={() => go(backPage)}>
          {backLabel}
        </button>
        <span className="map-title">{data.root.title}</span>
        {data.root.meta && <span className="mono small dim">{data.root.meta}</span>}
        <span className="map-spacer" />
        <button className="btn btn-small" onClick={() => zoomBy(1.25)}>+</button>
        <button className="btn btn-small" onClick={() => zoomBy(1 / 1.25)}>−</button>
        <button className="btn btn-small" onClick={() => setView({ x: 24, y: 24, k: 1 })}>Reset</button>
        <button className="btn btn-small" onClick={expandAll}>Expand all</button>
        <button className="btn btn-small" onClick={collapseAll}>Collapse all</button>
        {data.kind !== 'song' && (
          <span className="map-legend mono small dim">
            {Object.values(STATUS).map((s) => (
              <span key={s.label} className="map-legend-item">
                <span className="map-dot" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="map-viewport" ref={viewportRef} onPointerDown={panStart} onPointerMove={panMove} onPointerUp={panEnd} onPointerCancel={panEnd}>
        <div className="map-canvas" ref={canvasRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="map-edges" ref={svgRef} aria-hidden="true" />
          <div className="map-node map-root" data-node={data.root.id} style={at(data.root.id)} onPointerDown={(e) => nodeDown(e, data.root.id)} onPointerMove={nodeMove} onPointerUp={() => nodeUp(data.root.id)}>
            <p className="mono small dim">{labelFor(data.root, data.kind)}</p>
            <h2>{data.root.title}</h2>
            {data.root.sub && <p className="small dim">{data.root.sub}</p>}
            {data.root.body && <p className="small map-story">{data.root.body}</p>}
            {data.root.meta && <p className="mono small dim">{data.root.meta}</p>}
          </div>
          <div className="map-col">
            {data.children.map((nd) => renderNode(nd, data.root.id, null))}
          </div>
        </div>
        {picked && (
          <aside className="map-detail" aria-label="Details">
            <button className="map-detail-x" aria-label="Close" onClick={() => setSelected(null)}>×</button>
            <p className="mono small dim">
              {picked.status && <span className="map-dot" style={{ background: STATUS[picked.status]?.color }} />}{' '}
              {[picked.meta, picked.status ? STATUS[picked.status].label : ''].filter(Boolean).join(' · ')}
            </p>
            <h3>{picked.title}</h3>
            {picked.sub && <p className="small">{picked.sub}</p>}
            {picked.staging && <p className="small"><span className="mono small dim">Staging </span>{picked.staging}</p>}
            {picked.ends && <p className="small"><span className="mono small dim">Ends </span>{picked.ends}</p>}
            {picked.body && <p className="small"><span className="mono small dim">{picked.kind === 'shot' ? 'Line ' : ''}</span>{picked.kind === 'shot' ? `"${picked.body}"` : picked.body}</p>}
            {picked.children?.length > 0 && (
              <ul className="map-detail-list">
                {picked.children.slice(0, 12).map((ch) => (
                  <li key={ch.id}>
                    {ch.status && <span className="map-dot" style={{ background: STATUS[ch.status]?.color }} />} {ch.title}
                  </li>
                ))}
                {picked.children.length > 12 && <li className="dim">… {picked.children.length - 12} more</li>}
              </ul>
            )}
            {(picked.link?.production || picked.projectId) && (
              <button className="btn btn-small" onClick={() => (picked.projectId ? openShot(picked.projectId) : openProject(picked.link.production))}>
                {picked.kind === 'shot' ? (picked.projectId ? 'Open its renders' : 'Open the project') : 'Open the project'}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

const labelFor = (root, kind) => (kind === 'song' ? 'The song' : kind === 'feature' ? 'The film' : 'The film')

const collectIds = (nodes, depth) =>
  depth <= 0 ? [] : nodes.flatMap((nd) => (nd.children?.length ? [nd.id, ...collectIds(nd.children, depth - 1)] : []))
