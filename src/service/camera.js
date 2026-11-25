// Structured cinematography (the Director Workspace's §4, prompt-level): shot size, angle, movement and
// pace picked in Create, compiled into the prompt as the camera sentence — the words a cinematographer
// would write, so every engine reads them. Per-beat camera stays the Timeline's own field; the one-take
// and continuity rules stay the beats compiler's ("no cuts, no angle reversals").

export const SHOT_SIZES = { 'extreme-wide': 'Extreme wide shot', wide: 'Wide shot', medium: 'Medium shot', close: 'Close-up', 'extreme-close': 'Extreme close-up' }
export const ANGLES = { 'eye-level': 'at eye level', high: 'from a high angle', low: 'from a low angle', overhead: 'from directly overhead', dutch: 'with a Dutch tilt', pov: 'as a point-of-view shot' }
export const MOVEMENTS = { static: 'static camera', pan: 'panning', tilt: 'tilting', dolly: 'dolly in', truck: 'trucking sideways', pedestal: 'pedestal move', orbit: 'orbiting the subject', arc: 'arcing around the subject', handheld: 'handheld', crane: 'crane move', zoom: 'zooming in', tracking: 'tracking the subject' }
export const PACES = { slow: 'slow', steady: 'steady', fast: 'fast' }

// The pick, tidied: known values only; pace means something only with a move that isn't static.
export function cleanCamera(cam) {
  const out = {}
  if (SHOT_SIZES[cam?.size]) out.size = cam.size
  if (ANGLES[cam?.angle]) out.angle = cam.angle
  if (MOVEMENTS[cam?.movement]) out.movement = cam.movement
  if (out.movement && out.movement !== 'static' && PACES[cam?.pace]) out.pace = cam.pace
  return Object.keys(out).length ? out : null
}

// The camera sentence: "Wide shot, at eye level, slow dolly in". Null when nothing is picked.
export function cameraText(camera) {
  const c = cleanCamera(camera)
  if (!c) return null
  const move = c.movement ? [c.pace ? PACES[c.pace] : null, MOVEMENTS[c.movement]].filter(Boolean).join(' ') : null
  return [c.size ? SHOT_SIZES[c.size] : 'The shot', c.angle ? ANGLES[c.angle] : null, move].filter(Boolean).join(', ')
}

// The prompt the model reads, with the camera sentence in front (framing before the action).
export const withCamera = (prompt, camera) => {
  const line = cameraText(camera)
  return line ? `${line}.\n${String(prompt || '').trim()}` : prompt
}
