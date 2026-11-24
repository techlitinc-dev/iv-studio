import { useEffect, useRef } from 'react'
import { NavIcon } from './NavIcons'
import { UpdateButton } from './Update'
import RenderQueue from './RenderQueue'

// The top menu (App.jsx): the left sidebar's contents — every page of both halves, the library, the render
// queue with its live-preview switch, updates and the website link — in one dropdown from the titlebar.
// Closes on Escape, a click anywhere else, a window resize or blur, or any navigation. Arrow keys walk the
// items, Home/End jump, typing jumps to the next item by its first letter. The item that is the current page
// (or whose subpage is open) is marked with aria-current.
export default function TopMenu({ page, section, sections, subpages, missing, notify, website, queueRemote, openQueued, onGo, onClose }) {
  const panelRef = useRef(null)
  useEffect(() => {
    const outside = (e) => {
      if (panelRef.current?.contains(e.target) || e.target.closest?.('.menu-anchor')) return
      onClose()
    }
    const key = (e) => {
      if (e.key === 'Escape') return void onClose(true)
      const items = [...panelRef.current.querySelectorAll('[role="menuitem"]')]
      const at = items.indexOf(document.activeElement)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      } else if (e.key === 'Home') {
        e.preventDefault()
        items[0]?.focus()
      } else if (e.key === 'End') {
        e.preventDefault()
        items[items.length - 1]?.focus()
      } else if (/^[a-z]$/i.test(e.key)) {
        const want = e.key.toLowerCase()
        const hit = items.find((el, i) => i > at && el.textContent.trim().toLowerCase().startsWith(want)) || items.find((el) => el.textContent.trim().toLowerCase().startsWith(want))
        if (hit) {
          e.preventDefault()
          hit.focus()
        }
      }
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  useEffect(() => {
    panelRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [])
  const active = (id) => page === id || subpages[id]?.includes(page)
  return (
    <div className="topmenu" role="menu" ref={panelRef} aria-label="Pages and tools">
      {Object.entries(sections).map(([sec, items]) => (
        <div className="topmenu-group" key={sec} role="group" aria-label={sec === 'video' ? 'Visual' : 'Audio'}>
          <p className="topmenu-label mono">{sec === 'video' ? 'Visual' : 'Audio'}</p>
          {items.map(([id, label], i) => (
            <button
              key={id}
              role="menuitem"
              className={`topmenu-item ${active(id) ? 'on' : ''}`}
              aria-current={active(id) ? 'page' : undefined}
              onClick={() => onGo(sec, id)}
            >
              <span className="mono dim nav-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="nav-label">{label}</span>
              {id === 'settings' && missing > 0 && <span className="nav-dot" />}
            </button>
          ))}
        </div>
      ))}
      <div className="topmenu-group" role="group" aria-label="Library">
        <p className="topmenu-label mono">Library</p>
        <button role="menuitem" className={`topmenu-item nav-library ${page === 'media' ? 'on' : ''}`} aria-current={page === 'media' ? 'page' : undefined} onClick={() => onGo('video', 'media')}>
          <NavIcon id="media" className="nav-icon" />
          <span className="nav-label">Everything you made</span>
        </button>
      </div>
      <div className="topmenu-queue">
        <RenderQueue remote={queueRemote} notify={notify} open={openQueued} />
      </div>      <div className="topmenu-foot">
        <UpdateButton notify={notify} />
        <button className="link-btn mono nav-site" onClick={() => window.ivstudio.links.open(website)}>
          DD'S Techlit AI Solutions ↗
        </button>
      </div>
    </div>
  )
}
