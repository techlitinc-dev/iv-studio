// A shot's direction (the Director page): the request-shaped settings laid out there — prompt, camera,
// beats, cast, LoRAs — plus the audio plan: dialogue, music and sound clips at their timeline offsets.
// Saved on the shot's project record, so Create, the Director and the storyboard read the same truth.
// The render reads the request fields (voiceLine = the first dialogue clip); the music and sound clips
// are post — director:assemble lays them into an Edit after the render.
import { cleanBeats } from './beats.js'
import { cleanCamera } from './camera.js'

export const AUDIO_KINDS = ['voice', 'music', 'sfx']
export const MAX_AUDIO_CLIPS = 24

const tenth = (v) => Math.round(Number(v) * 10) / 10

// The audio plan, tidied: known kinds, a file, a start at 0 or later, half a second at least.
export function cleanAudioPlan(plan) {
  return (Array.isArray(plan) ? plan : [])
    .map((c) => ({
      kind: AUDIO_KINDS.includes(c?.kind) ? c.kind : 'sfx',
      file: String(c?.file || ''),
      name: String(c?.name || '')
        .trim()
        .slice(0, 60),
      start: Math.max(0, tenth(c?.start) || 0),
      length: Math.max(0.5, tenth(c?.length) || 0.5)
    }))
    .filter((c) => c.file)
    .slice(0, MAX_AUDIO_CLIPS)
}

// A direction, tidied for saving: camera and beats through their own cleaners (beats that don't validate
// yet — an overlap being dragged — stay as they are for the person to finish; the plan refuses them at
// render with the reason), the audio plan cleaned, and the voice line kept in step with the dialogue
// track: the first voice clip is what the render lip-syncs to.
export function cleanDirection(d) {
  if (!d || typeof d !== 'object') return null
  const out = { ...d }
  out.camera = cleanCamera(d.camera)
  try {
    out.beats = cleanBeats(d.beats, Number(d.seconds) || 15)
  } catch {
    out.beats = Array.isArray(d.beats) ? d.beats : []
  }
  out.audioPlan = cleanAudioPlan(d.audioPlan)
  const voice = out.audioPlan.find((c) => c.kind === 'voice')
  out.voiceLine = voice ? voice.file : d.voiceLine || null
  out.updatedAt = new Date().toISOString()
  return out
}

// The render request a direction hands to Create: the request fields, without the Director's own bookkeeping.
export function directionRequest(d) {
  const { audioPlan, updatedAt, ...request } = d || {}
  return request
}
