// Sequences: several shots that play as one continuous video. This builds the ComfyUI graphs that the
// Techlit Studio workflow doesn't cover. The model, encoder, VAE and turbo LoRA names come from the Techlit Studio
// template, so a sequence renders with exactly the models Setup checked.
//   take      - H3 Multishot's sampler renders every shot as one seamless take (ref2va)
//   retake    - H3 Retake redoes one stretch of a finished video and keeps the rest
//   renderout - optional colour smoothing across the joins (H3 Chain Normalize), then the DLSS pass
// Shot by shot rendering reuses the Techlit Studio workflow's own Continue mode (see studio.js).
import { resolveFrames, resolveSize } from './plan.js'
import { sections } from './lint.js'

export const SHOT_SECONDS = [10, 15] // H3 Multishot's verified windows (243 and 362 frames); 5 s shots clip their joins
export const RETAKE_MODES = {
  both: 'video + audio (redo the moment)',
  video: 'video only (keep the performance)',
  audio: 'audio only (keep the picture)'
}
export const SEQUENCE_DEFAULTS = {
  method: 'take',
  character: 'tess',
  aspect: '16:9',
  megapixels: 0.9, // 1280x736 at 16:9, the pack's tested size
  shotSeconds: 10,
  steps: 8,
  seed: 4242,
  voiceRef: null,
  loras: [], // extra LoRAs for every shot: [{name, strength}], after the character's
  // One take comes in two kinds (GitHub #38):
  //   plain - the fl2va model, prompts as written. H3 Multishot's docs: fl2va chains shots just as well, and it is
  //           the configuration that passed their blind review.
  //   refs  - the ref2va model with references carried into every shot: the character's face picture, more
  //           pictures of the same person, a voice sample, or shot 1's own voice. Needs at least one.
  takeKind: 'plain',
  refs: { face: true, pictures: [], selfVoice: false },
  startImage: null // optional first frame for shot 1, either kind
}

// A sequence saved before the two kinds: one with a voice sample was a references take, any other a plain one.
export const takeKindOf = (seq) => (seq?.takeKind === 'refs' || seq?.takeKind === 'plain' ? seq.takeKind : seq?.voiceRef ? 'refs' : 'plain')
export const MAX_REF_PICTURES = 4

// What a references take carries, in the order H3 Multishot labels them: the pictures are <Picture 1..N> (all of
// them pictures of the one main person: the sampler declares every picture <Subject 1>), the voice sample is
// <Audio 1>; selfVoice pins shot 1's own voice for every later shot when there is no sample.
export function takeReferences(seq, face = null) {
  const r = { face: true, pictures: [], selfVoice: false, ...(seq?.refs || {}) }
  const pictures = [...(r.face && face ? [face] : []), ...(Array.isArray(r.pictures) ? r.pictures : [])].filter(Boolean).slice(0, MAX_REF_PICTURES)
  const voice = seq?.voiceRef || null
  const selfVoice = !voice && !!r.selfVoice
  return { pictures, voice, selfVoice, count: pictures.length + (voice ? 1 : 0) + (selfVoice ? 1 : 0) }
}

export const MAX_SEQUENCE_LORAS = 4
// A sequence's extra LoRAs as saved: named, strength -2..2 (default 0.8), no repeats, at most MAX_SEQUENCE_LORAS.
export function cleanSequenceLoras(loras) {
  const seen = new Set()
  const out = []
  for (const l of Array.isArray(loras) ? loras : []) {
    const name = typeof l?.name === 'string' ? l.name.trim() : ''
    if (!name || seen.has(name)) continue
    seen.add(name)
    const n = Number(l.strength)
    out.push({ name, strength: Number.isFinite(n) ? Math.min(2, Math.max(-2, Math.round(n * 100) / 100)) : 0.8, ...(l.title && { title: String(l.title) }) })
  }
  return out.slice(0, MAX_SEQUENCE_LORAS)
}

// Node ids the studio reads outputs from.
export const SAVES = { master: 'save', final: 'final' }

const fill = (text, character) => (character ? text.replaceAll('{char}', character.trigger) : text)

// One shot of a one-take script. With a voice attached, H3 Multishot writes the reference (ref2va) sections
// itself (subject_definitions, summary, retention_analysis, non_diegetic_music: N/A) and puts the shot's text
// in detailed_description, so the shot goes as plain text: the description with its sound folded in. Sent as
// written, Techlit Studio's own section names ended up inside detailed_description (GitHub #14). With no
// reference attached there is nothing for those sections to define, and the written prompt goes as it is.
// bind ({pictures, voice}): the references this shot carries, named in one opening line the way the pack's docs
// say to ("She looks like the woman in <Picture 1>." / "Her voice is the voice in <Audio 1>.").
export function takeShot(prompt, { wrapped = false, bind = null, who = '{char}' } = {}) {
  const text = String(prompt || '').trim()
  if (!wrapped) return text
  const s = sections(text)
  const body = s.integrated_multimodal_description ?? s.detailed_description ?? s._head
  const sound = s.overall_soundscape && !/^n\/?a\.?$/i.test(s.overall_soundscape) ? `\n\nThe sound: ${s.overall_soundscape}` : ''
  const line = bindLine(bind, who)
  if (!body) return line ? `${line}\n\n${text}` : text
  return `${line ? `${line}\n\n` : ''}${body}${sound}`
}
export function bindLine(bind, who = '{char}') {
  if (!bind) return ''
  const parts = []
  if (bind.pictures) parts.push(`${who} looks like the person in ${Array.from({ length: bind.pictures }, (_, i) => `<Picture ${i + 1}>`).join(' and ')}.`)
  if (bind.voice) parts.push(`${who}'s voice is the voice in <Audio 1>.`)
  return parts.join(' ')
}

// Each shot exactly as a take sends it to H3 Multishot ({char} still unfilled): the "What gets sent" view.
// refs: takeReferences(). A plain take sends the prompts as written; a references take sends each one's
// description with its binding line, and the node adds the ref2va sections (subject_definitions, summary,
// retention_analysis, non_diegetic_music: N/A) around it. Shot 1 of a selfVoice take has no voice yet.
export function takeScript(seq, refs) {
  const kind = takeKindOf(seq)
  const who = seq.character === 'none' ? 'The person' : '{char}'
  return (seq.shots || []).map((s, i) => {
    if (kind !== 'refs') return takeShot(s.prompt)
    const bind = { pictures: refs?.pictures?.length || 0, voice: !!refs?.voice || (!!refs?.selfVoice && i > 0) }
    return takeShot(s.prompt, { wrapped: true, bind, who })
  })
}

// Loaders shared by every sequence graph: the main H3 model, the turbo LoRA, the character LoRA, then the
// sequence's extra LoRAs. unet: the model the studio picked (a plain take's fl2va, a references take's or a
// retake's ref2va, or the one chosen in Settings); without one, the template's ref2va.
function loaders(template, character, unet, extra = []) {
  const g = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: unet || template['301'].inputs.unet_name, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { ...template['2'].inputs } },
    vvae: { class_type: 'VAELoader', inputs: { ...template['3'].inputs } },
    avae: { class_type: 'VAELoader', inputs: { ...template['4'].inputs } },
    turbo: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['unet', 0], lora_name: template['5'].inputs.lora_name, strength_model: 1 } }
  }
  let model = ['turbo', 0]
  if (character && !character.lora) throw new Error(`${character.name} has no H3 LoRA, and a one take needs one. Use Shot by shot, or add an H3 LoRA in their character page.`)
  if (character) {
    g.char = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: character.lora, strength_model: character.strength ?? 0.8 } }
    model = ['char', 0]
  }
  cleanSequenceLoras(extra).forEach((l, k) => {
    g[`lora${k + 1}`] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: l.name, strength_model: l.strength } }
    model = [`lora${k + 1}`, 0]
  })
  return { g, model }
}

const save = (images, audio, prefix) => ({
  class_type: 'VHS_VideoCombine',
  inputs: { images, audio, frame_rate: 24, loop_count: 0, filename_prefix: prefix, format: 'video/h264-mp4', pix_fmt: 'yuv420p', crf: 17, save_metadata: true, trim_to_audio: false, pingpong: false, save_output: true }
})

export function validateSequence(seq, characters, { face = null } = {}) {
  const errors = []
  const character = seq.character === 'none' ? null : characters.find((c) => c.id === seq.character)
  if (seq.character !== 'none' && !character) errors.push(`Unknown character "${seq.character}".`)
  // a one take loads the character's LoRA itself; shot by shot renders each shot like Create (their RefMod or picture works)
  if (character && !character.lora && (seq.method || 'take') === 'take') errors.push(`${character.name} has no H3 LoRA, and a one take needs one. Use Shot by shot (it uses their ${character.refmod ? 'RefMod' : 'picture'}), or add an H3 LoRA in their character page.`)
  if (!seq.shots?.length) errors.push('Add at least one shot.')
  seq.shots?.forEach((s, i) => !s.prompt?.trim() && errors.push(`Shot ${i + 1} has no prompt.`))
  if (seq.shots?.length > 8) errors.push('At most 8 shots in one take.')
  if (!SHOT_SECONDS.includes(seq.shotSeconds)) errors.push(`Shot length must be ${SHOT_SECONDS.join(' or ')} seconds.`)
  if ((seq.method || 'take') === 'take' && takeKindOf(seq) === 'refs' && !takeReferences(seq, character ? face : null).count)
    errors.push('A take with references needs at least one: the character\'s face picture, a picture of the person, a voice sample, or "Keep shot 1\'s voice". Or switch to Plain.')
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { errors })
  return character
}

// The whole sequence as one continuous take. refs (a references take): { pictures: [staged names], voice: staged
// name, selfVoice }, carried into every shot; a plain take has none and sends its prompts as written. startImage
// (staged name): shot 1's first frame, either kind. voiceRef is the older way of passing a voice.
export function takeGraph({ template, seq, character, name, voiceRef, unet, refs = null, startImage = null }) {
  const r = refs || (voiceRef ? { pictures: [], voice: voiceRef, selfVoice: false } : null)
  const withRefs = !!(r && (r.pictures?.length || r.voice || r.selfVoice))
  const { g, model } = loaders(template, character, unet, seq.loras)
  const { width, height } = resolveSize(seq.aspect, seq.megapixels)
  const frames = resolveFrames(seq.shotSeconds)
  const sampler = {
    model,
    clip: ['clip', 0],
    video_vae: ['vvae', 0],
    audio_vae: ['avae', 0],
    script: (withRefs ? takeScript({ ...seq, takeKind: 'refs' }, r) : seq.shots.map((s) => takeShot(s.prompt))).map((t) => fill(t, character)).join('\n---\n'),
    shot_count: 0,
    width,
    height,
    frames_per_shot: frames,
    seed: seq.seed,
    steps: seq.steps,
    seed_per_shot: true,
    sampler_name: 'er_sde',
    scheduler: 'beta',
    save_every_shot: false
  }
  if (withRefs && r.voice) {
    g.voice = { class_type: 'LoadAudio', inputs: { audio: r.voice } }
    sampler.voice_ref = ['voice', 0]
  }
  if (withRefs && r.selfVoice && !r.voice) sampler.self_anchor_voice = true
  // the reference pictures as one batch, <Picture 1..N> in order: ComfyUI's Batch Images centre-crops each to the
  // first one's size, and the sampler then scales every picture to the take's size itself
  if (withRefs && r.pictures?.length) {
    r.pictures.forEach((p, k) => (g[`ref${k + 1}`] = { class_type: 'LoadImage', inputs: { image: p } }))
    if (r.pictures.length === 1) sampler.reference_images = ['ref1', 0]
    else {
      g.refs = { class_type: 'BatchImagesNode', inputs: Object.fromEntries(r.pictures.map((_, k) => [`images.image${k}`, [`ref${k + 1}`, 0]])) }
      sampler.reference_images = ['refs', 0]
    }
  }
  if (startImage) {
    g.start = { class_type: 'LoadImage', inputs: { image: startImage } }
    sampler.start_image = ['start', 0]
  }
  g.take = { class_type: 'H3MultishotSampler', inputs: sampler }
  g[SAVES.master] = save(['take', 0], ['take', 1], `H3/sequences/${name}_take`)
  const seconds = (frames * seq.shots.length) / 24
  return { graph: g, resolved: { width, height, framesPerShot: frames, shots: seq.shots.length, seconds: +seconds.toFixed(1) } }
}

// Redo start..end seconds of a finished video. Everything outside the window is kept as it was.
export function retakeGraph({ template, seq, character, name, sourcePath, prompt, start, end, mode, seed, unet }) {
  const { g, model } = loaders(template, character, unet, seq.loras)
  g.src = { class_type: 'VHS_LoadVideoPath', inputs: { video: sourcePath, force_rate: 24, custom_width: 0, custom_height: 0, frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1, format: 'AnimateDiff' } }
  g.sampler = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'er_sde' } }
  g.sigmas = { class_type: 'BasicScheduler', inputs: { model, scheduler: 'beta', steps: seq.steps, denoise: 1 } }
  g.retake = {
    class_type: 'H3Retake',
    inputs: { model, clip: ['clip', 0], video_vae: ['vvae', 0], audio_vae: ['avae', 0], images: ['src', 0], audio: ['src', 2], prompt: fill(prompt, character), start_seconds: start, end_seconds: end, mode: RETAKE_MODES[mode], seed, sampler: ['sampler', 0], sigmas: ['sigmas', 0] }
  }
  g[SAVES.master] = save(['retake', 0], ['retake', 1], `H3/sequences/${name}_retake`)
  return { graph: g }
}

// The finishing pass on a master: optional colour smoothing across joins, then DLSS (scale, frame rate).
export function renderOutGraph({ template, name, sourcePath, normalize, scale, fps }) {
  const g = {}
  let pathRef
  if (normalize) {
    g.src = { class_type: 'VHS_LoadVideoPath', inputs: { video: sourcePath, force_rate: 24, custom_width: 0, custom_height: 0, frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1, format: 'AnimateDiff' } }
    g.norm = { class_type: 'H3ChainNormalize', inputs: { images: ['src', 0], baseline_seconds: 10, skip_seconds: 2, fps: 24, strength: 1, deadband: 1.06, ema: 0.1, colour_match: true } }
    g.smooth = save(['norm', 0], ['src', 2], `H3/sequences/${name}_smoothed`)
    g.pick = { class_type: 'VHS_SelectFilename', inputs: { filenames: ['smooth', 0], index: -1 } }
    pathRef = ['pick', 0]
  } else {
    g.path = { class_type: 'PrimitiveString', inputs: { value: sourcePath } }
    pathRef = ['path', 0]
  }
  g.dlss = { class_type: 'DLSS5_Enhance_Video', inputs: { ...template['703'].inputs, 'Video Path': pathRef, Scale: scale, 'Target FPS': fps, 'Filename Prefix': name, 'Output Directory': 'H3/sequences' } }
  g[SAVES.final] = { class_type: 'PreviewAny', inputs: { source: ['dlss', 0] } }
  return { graph: g }
}
