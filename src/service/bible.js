// The character bible: who a character is (name, look in words, manner, voice), their pictures with roles, and
// what each model needs to show them. One character works with every model; `showFor` picks what a model gets.
//
// Stored in characters.json (Studio.characters). A bible keeps the old preset's fields where the rest of Techlit Studio
// reads them, so nothing that knew the old presets changes: `lora`, `trigger`, `strength` and `refmod` are H3's main
// LoRA or RefMod, and `picture` is the face picture. New fields:
//   version 2
//   about        one line: who they are ("a jazz singer in her thirties")
//   look         their look in words, written for prompts
//   manner       how they move and talk
//   voiceNote    their voice in words ("soft Bristol West Country voice")
//   pictures     [{ id, file, role }], role in ROLES; the first face picture is `picture`
//   models.h3    { loras: [{ name, strength }] }: more H3 LoRAs loaded with the main one (a style, an outfit)
// Pure (no files), so the window uses it too; Studio copies pictures and writes the file.

export const ROLES = ['face', 'three-quarter', 'profile', 'full body', 'expression', 'outfit', 'other']
// short names for menus and labels
export const ROLE_SHORT = { face: 'Face', 'three-quarter': 'Three-quarter', profile: 'Profile', 'full body': 'Full body', expression: 'Expression', outfit: 'Outfit', other: 'Other' }
export const ROLE_TEXT = {
  face: 'Face, from the front',
  'three-quarter': 'Face, three-quarter',
  profile: 'Profile',
  'full body': 'Full body',
  expression: 'An expression',
  outfit: 'An outfit',
  other: 'Other'
}
// What Seedance gets of a character, in this order, up to SEEDANCE_PICTURES (design decision 2: face, three-quarter,
// full body). The rest come after when a shot asks for more.
export const SEEDANCE_ORDER = ['face', 'three-quarter', 'full body', 'profile', 'outfit', 'expression', 'other']
export const SEEDANCE_PICTURES = 3

// The models a bible has a card for, in the order the profile shows them.
export const MODELS = {
  h3: { label: 'MiniMax H3', engines: ['h3'] },
  seedance: { label: 'Seedance 2.5', engines: ['seedance'] }
}

const clean = (s) => (typeof s === 'string' ? s.trim() : '')
const sameFile = (a, b) => !!a && !!b && String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase()
let n = 0
export const pictureId = () => `p${Date.now().toString(36)}${(n++ % 1296).toString(36).padStart(2, '0')}`
// An old preset's picture gets an id from its path, so it's the same every time the preset is read (before it's saved).
const idFor = (file) => {
  let h = 5381
  for (const ch of String(file).toLowerCase()) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return `pf${h.toString(36)}`
}

// The face picture of a set of pictures: the first face, else the first three-quarter, else the first picture.
export function faceOf(pictures = []) {
  return (pictures.find((p) => p.role === 'face') || pictures.find((p) => p.role === 'three-quarter') || pictures[0])?.file || null
}

// Any character (an old preset or a bible) as a bible, with the old fields kept in step. An old preset's picture
// becomes its face picture; nothing it had is dropped.
export function normalize(c) {
  if (!c || typeof c !== 'object') return c
  const pictures = (Array.isArray(c.pictures) ? c.pictures : [])
    .filter((p) => p && p.file)
    .map((p) => ({ id: p.id || idFor(p.file), file: p.file, role: ROLES.includes(p.role) ? p.role : 'other' }))
    .filter((p, i, all) => all.findIndex((q) => sameFile(q.file, p.file)) === i)
  if (c.picture && !pictures.some((p) => sameFile(p.file, c.picture))) pictures.unshift({ id: idFor(c.picture), file: c.picture, role: 'face' })
  const h3 = c.models?.h3 || {}
  const loras = (Array.isArray(h3.loras) ? h3.loras : [])
    .filter((l) => l?.name && !sameFile(l.name, c.lora))
    .map((l) => ({ name: l.name, strength: Number.isFinite(Number(l.strength)) ? Number(l.strength) : 0.8 }))
  return {
    ...c,
    version: 2,
    name: clean(c.name) || 'Unnamed',
    about: clean(c.about),
    look: clean(c.look),
    manner: clean(c.manner),
    voiceNote: clean(c.voiceNote),
    trigger: c.trigger ?? '',
    strength: Number.isFinite(Number(c.strength)) ? Number(c.strength) : c.refmod && !c.lora ? 1 : 0.8,
    pictures,
    picture: faceOf(pictures),
    models: { ...(c.models || {}), h3: { ...h3, loras } }
  }
}

// An old characters.json (every entry a preset) needs moving over when any entry isn't version 2.
export const needsMove = (list) => Array.isArray(list) && list.some((c) => c && c.version !== 2)

// How a model shows a character, for a shot: { way, label, loras?, pictures?, words, note? }.
//   way: 'lora' | 'refmod' | 'pictures' | 'words'
// engine: 'h3' | 'seedance' | anything else (words only, until its row is built).
export function showFor(engine, c, { exists = () => true } = {}) {
  if (!c) return null
  const words = wordsFor(c)
  const first = c.name.split(/\s+/)[0]
  if (engine === 'seedance') {
    const pictures = seedancePictures(c)
    if (pictures.length) return { way: 'pictures', label: `${first} · ${pictures.length} picture${pictures.length > 1 ? 's' : ''}`, pictures, words }
    return { way: 'words', label: `${first} · words only`, words, note: `${c.name} has no pictures, so Seedance only reads ${words ? 'their description' : 'the name'}. Add a picture for a likeness.` }
  }
  if (engine === 'h3' || !engine) {
    if (c.lora && exists(c.lora)) return { way: 'lora', label: `${first} · H3 LoRA${c.models?.h3?.loras?.length ? ` + ${c.models.h3.loras.length}` : ''}`, loras: [{ name: c.lora, strength: c.strength }, ...(c.models?.h3?.loras || [])], words }
    if (c.refmod) return { way: 'refmod', label: `${first} · RefMod`, words }
    if (c.picture) return { way: 'pictures', label: `${first} · picture`, pictures: [{ file: c.picture, role: 'face' }], words, note: c.lora ? `${c.name}'s H3 LoRA isn't in ComfyUI, so their face picture shows H3 who they are.` : null }
    return { way: 'words', label: `${first} · words only`, words, note: `${c.name} has no H3 LoRA and no picture, so H3 imagines them${words ? ' from their description' : ''}.` }
  }
  return { way: 'words', label: `${first} · words only`, words }
}

// Their look in one prompt sentence: "Tess: a woman in her thirties; shoulder-length auburn hair, freckles."
export function wordsFor(c) {
  const parts = [c.about, c.look].map(clean).filter(Boolean).map((s) => s.replace(/[.\s]+$/, ''))
  return parts.length ? `${c.name.split(/\s+/)[0]}: ${parts.join('; ')}.` : ''
}

// The pictures Seedance gets: by SEEDANCE_ORDER, one per role first, then the rest, up to `max`.
export function seedancePictures(c, max = SEEDANCE_PICTURES) {
  const pics = c?.pictures?.length ? c.pictures : c?.picture ? [{ file: c.picture, role: 'face' }] : []
  const out = []
  for (const role of SEEDANCE_ORDER) {
    const p = pics.find((x) => x.role === role && !out.includes(x))
    if (p) out.push(p)
  }
  for (const p of pics) if (!out.includes(p)) out.push(p)
  return out.slice(0, max)
}

// What a Seedance shot writes for each of a character's pictures, so the model knows what it's for.
export function seedanceRole(tag, role, first) {
  if (role === 'full body') return `${tag} shows ${first}'s full body, build and clothes. Do not use the image background.`
  if (role === 'outfit') return `${tag} shows ${first}'s outfit. Do not use the image background.`
  if (role === 'expression') return `${tag} is ${first} with a different expression; keep the face.`
  if (role === 'profile') return `${tag} is ${first} in profile; keep the face.`
  return `${tag} defines ${first}'s face, hair and build. Do not use the image background.`
}

// Per model, for the profile's cards and the character grid: { h3: { ready, label }, seedance: { ready, label } }.
// ready: 'lora' | 'refmod' | 'pictures' | 'words'.
export function readiness(c, { exists = () => true } = {}) {
  const out = {}
  for (const [key, m] of Object.entries(MODELS)) {
    const s = showFor(m.engines[0], c, { exists })
    out[key] = { ready: s.way, label: READY_TEXT[s.way], note: s.note || null }
  }
  return out
}
const READY_TEXT = { lora: 'Ready with LoRA', refmod: 'Ready with RefMod', pictures: 'Ready with pictures', words: 'Words only' }

// An H3 request with a character that has no usable H3 LoRA or RefMod: the character comes in through their picture
// as a referenced subject (cast.js resolveMentions, written @Handle), or by name. Returns { request, notes }.
// handle: the character's @ handle (Cast.members). A LoRA or RefMod character passes through unchanged.
export function h3Request(request, characters, { handle = null, exists = () => true } = {}) {
  const id = request.character
  if (!id || id === 'none') return { request, notes: [] }
  const c = characters.find((x) => x.id === id)
  if (!c) return { request, notes: [] }
  const s = showFor('h3', c, { exists })
  if (s.way === 'lora' || s.way === 'refmod') return { request, notes: [] }
  const notes = s.note ? [{ level: 'warning', message: s.note }] : []
  const by = s.way === 'pictures' && handle ? `@${handle}` : c.name.split(/\s+/)[0]
  let prompt = String(request.prompt || '').replace(/\{char\}/g, by)
  if (s.way === 'pictures' && handle && !prompt.includes(`@${handle}`)) prompt = `@${handle} is in the shot. ${prompt}`
  return { request: { ...request, prompt, character: 'none' }, notes }
}
