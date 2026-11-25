// Shared bits of the film pages: the Projects wizard (Projects.jsx) and the board's management views
// (FilmBoard.jsx) both read a shot's state and format the same way.
import { media } from '../media'
import { fileUrl } from './edit/model'

// Where a shot is in Film it, as a pill: [label, tone].
export const FILM_STATE = {
  draft: ['Not planned', ''],
  ready: ['Not filmed yet', ''],
  speaking: ['Saying the line…', 'busy'],
  queued: ['Waiting to film', 'busy'],
  rendering: ['Filming…', 'busy'],
  pick: ['Pick a take', 'pick'],
  finishing: ['Finishing…', 'busy'],
  finished: ['Done', 'ok'],
  error: ['Failed', 'bad']
}
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
export const src = (o) => (o?.path ? fileUrl(o.path) : media(o?.url))
export const first = (x) => String(x || '').split(/\s+/)[0].toLowerCase()
// a name in capitals, as a script's cue writes it, the way people read it: "MR. WHISKERS" -> "Mr. Whiskers"
export const nice = (n) => (n && n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : n)
export const ratio = (aspect) => aspect.replace(':', ' / ')
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
// about how long a hunt takes on a 4090: ~14 s of GPU per second of preview
export const estimate = (shots, previews) => Math.max(1, Math.round(shots.reduce((n, s) => n + s.seconds, 0) * previews * 14 / 60))

// Where a shot is, for the dashboard and the Plan view's Gantt: its status, how far along that is as a
// percent (the way OpenProject derives % complete from a work package's status), and its colour.
export const statusOf = (sh) => sh.state?.status || 'draft'
export const PROGRESS = { draft: 0, ready: 10, speaking: 30, queued: 30, rendering: 50, finishing: 85, pick: 75, finished: 100, error: 0 }
export const STATUS_COLOR = {
  draft: 'rgba(241, 237, 229, 0.25)',
  ready: 'rgba(241, 237, 229, 0.55)',
  speaking: '#f44859',
  queued: '#f44859',
  rendering: '#f44859',
  finishing: '#f44859',
  pick: '#e8b44c',
  finished: '#7fc97f',
  error: '#f19dac'
}
// a scene's scheduled span: its own plan when it has one, else the earliest start and latest end of its shots
export const scenePlan = (sc) => {
  if (sc.plan?.start && sc.plan?.end) return sc.plan
  const days = (sc.shots || []).map((sh) => sh.plan).filter(Boolean)
  if (!days.length) return null
  return { start: days.map((p) => p.start).sort()[0], end: days.map((p) => p.end).sort().at(-1) }
}
