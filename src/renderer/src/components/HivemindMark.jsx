import { createPortal } from 'react-dom'
import logo from '../assets/tl-mark.svg'
import './HivemindMark.css'

// The supplied logo is used unchanged. Motion belongs to its surrounding UI.
export function HivemindMark({ active = false, size = 'normal' }) {
  return <span className={`hm-mark hm-${size}${active ? ' hm-active' : ''}`} aria-hidden="true"><span className="hm-aura"/><img src={logo} alt="" draggable="false"/></span>
}

export function HivemindLoading({ label }) {
  return label ? createPortal(<div className="hm-loading" role="status" aria-live="polite" aria-atomic="true"><div className="hm-loading-card"><HivemindMark active size="large"/><strong>Techlit Link</strong><p>{label}</p><span className="hm-loading-line" aria-hidden="true"/></div></div>, document.body) : null
}

// One short visual beat for an app handoff, concurrent with the actual work.
// No progress percentage or completion is invented, and errors are immediate.
export const handoffBeat = () => new Promise(resolve => setTimeout(resolve, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480))
