// Shot statuses (the Director Workspace's storyboard marks): where every shot stands, on the Shots page's
// tiles and filters and in Create's manifest. Two layers:
//   marks — the person's own calls, stored on the project record (studio.setProjectStatus): ready (the
//     Phase-1 "ready for server" approval), approved (the take is chosen, this shot is done creatively),
//     locked (hands off: don't re-render or restyle it)
//   state — the one status shown, derived from the marks and the jobs: what's happening right now beats
//     the mark, the mark beats what the work shows, and a shot with nothing yet is drafting.

export const SHOT_MARKS = ['ready', 'approved', 'locked']
export const SHOT_STATES = ['drafting', 'ready', 'rendering', 'review', 'approved', 'locked']
export const STATE_NAME = { drafting: 'Drafting', ready: 'Ready', rendering: 'Rendering', review: 'Review', approved: 'Approved', locked: 'Locked' }

// project: the record (status = the stored mark, or null). jobs: its jobs, as publicJob rows.
export function shotState(project, jobs) {
  if ((jobs || []).some((j) => !['success', 'error', 'cancelled'].includes(j.status))) return 'rendering'
  if (SHOT_MARKS.includes(project?.status)) return project.status
  if ((jobs || []).some((j) => j.status === 'success' && (j.outputs || []).some((o) => o.kind === 'preview' || o.kind === 'final'))) return 'review'
  return 'drafting'
}

// A manual shot label ("SC_04_SH_03A"): letters, digits, dot, dash and underscore, at most 24 — or null.
export function cleanLabel(label) {
  const s = String(label || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 24)
  return s || null
}
