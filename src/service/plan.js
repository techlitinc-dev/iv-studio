// Turns a render request (from the studio or an agent) into the groups and node values of the Techlit Studio
// graph, and resolves the real pixel size, frame count and duration before anything runs.
import { cleanBeats, withBeats } from './beats.js'
import { cleanCamera, withCamera } from './camera.js'
import { cleanIntent, cleanLocks, cleanMotionStyle, DEFAULT_MOTION_STYLE } from './contract.js'

export const MODES = {
  text: { group: 'mode1', label: 'Text to video', model: 'fl2va' },
  frames: { group: 'mode2', label: 'First / last frame', model: 'fl2va' },
  reference: { group: 'mode3', label: 'Reference to video', model: 'ref2va' },
  continue: { group: 'mode4', label: 'Continue a video', model: 'fl2va' }
}

// Keyframes' one take (H3 Multishot's H3Keyframes): this many pictures at most in one shot
export const KEYFRAME_MAX = 6

// Pika H3 Flex: Pika's adapter LoRAs for H3's two trunks (Model Derivatives of MiniMax H3, under the MiniMax H3
// Community License), applied at strength 1, and the six-step sampling schedule the adapters are released with —
// the official workflows' ManualSigmas values with the lcm sampler. The adapters are trained for exactly these
// sigmas, so a Pika shot ignores the request's own sampler/steps and the finish keeps its own tuned refine.
export const PIKA_VARIANT = 'pika'
export const PIKA_LORA = { fl2va: 'pika_h3_flex_fl2va_v1_bf16.safetensors', ref2va: 'pika_h3_flex_ref2va_v1_bf16.safetensors' }
const PIKA_SIGMAS = '1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0'

// Pika fast render (the speed stack from the Pika H3 Flex two-stage workflows): the core BlockSparseAttention node
// (8) switches from the template's 'sla' to 'sol-attn', KJNodes' sage attention patch (already a pack) drops in
// ahead of it, and every preview take samples with comfyui-SelfLift's SelfLiftH3Sampler — a low-resolution prefix,
// the H3 latent upscaler's lift, then the full-resolution pass — on an empty (zeroed) negative at cfg 1, decoding
// through Kijai's experimental Sol VAE. Widget values are the released workflows' own. Node ids 1201+ are free in
// the template (its max is 1104); patch additions splice these nodes in (applyPatch below).
export const PIKA_SOL_VAE = 'minimax_h3_sol_vae_int8_convrot.safetensors'
const H3_LATENT_UPSCALER = 'minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors'
const FAST_NODES = {
  sage: '1201', // MiniMaxH3MemoryEfficientSageAttentionPatch, model 7 -> 8
  zero: '1204', // ConditioningZeroOut(1103), the empty negative every take shares
  takes: [
    { add: '1202', cache: '151', dy: 0 },
    { add: '1203', cache: '152', dy: 1000 },
    { add: '1205', cache: '153', dy: 2000 }
  ]
}

// A node swapped or extended after the graph is built (plan.patch): { id: { class_type, remove: [inputs], inputs } }.
// An entry whose id is not in the graph and that carries a class_type ADDS the node instead (the Pika fast stack's
// spliced-in patch nodes); without a class_type it stays a no-op, so rewrites of nodes a mode left out are safe.
export function applyPatch(graph, patch) {
  if (!patch) return graph
  for (const [id, change] of Object.entries(patch)) {
    if (!(id in graph)) {
      if (change.class_type) graph[id] = { class_type: change.class_type, inputs: { ...(change.inputs || {}) } }
      continue
    }
    const inputs = { ...graph[id].inputs }
    for (const k of change.remove || []) delete inputs[k]
    graph[id] = { ...graph[id], ...(change.class_type ? { class_type: change.class_type } : {}), inputs: { ...inputs, ...(change.inputs || {}) } }
  }
  return graph
}

export const ASPECTS = {
  '16:9': '16:9 (Widescreen)',
  '9:16': '9:16 (Portrait Widescreen)',
  '1:1': '1:1 (Square)',
  '4:3': '4:3 (Standard)',
  '3:4': '3:4 (Portrait Standard)',
  '3:2': '3:2 (Photo)',
  '2:3': '2:3 (Portrait Photo)',
  '21:9': '21:9 (Ultrawide)'
}

// DLSS takes 30/50/60/120; the cloud's RIFE takes whole multiples of 24 (48/72/120). The studio
// checks a request against what the connected ComfyUI can do (remote.js capabilities).
export const FRAME_GEN_FPS = [0, 30, 48, 50, 60, 72, 120]
const RATIO = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4], '3:2': [3, 2], '2:3': [2, 3], '21:9': [21, 9] }

// ComfyUI's ResolutionSelector, multiple 32.
export function resolveSize(aspect, megapixels) {
  const [a, b] = RATIO[aspect]
  const s = Math.sqrt((megapixels * 1024 * 1024) / (a * b))
  return { width: Math.round((a * s) / 32) * 32, height: Math.round((b * s) / 32) * 32 }
}

// Seedhunter 2.5's formula: seconds -> frames on H3's 17n+5 grid at 24 fps.
export function resolveFrames(seconds) {
  const f = Math.max(5, Math.round(seconds * 24))
  return f + ((5 - (f % 17)) % 17 + 17) % 17
}

// The latent upscaler sizes by megapixels with 32-pixel alignment; this is its result for a given input.
export function resolveFinalSize(width, height, megapixels) {
  const s = Math.sqrt((megapixels * 1024 * 1024) / (width * height))
  return { width: Math.round((width * s) / 32) * 32, height: Math.round((height * s) / 32) * 32 }
}

const loraState = (loras) =>
  JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: loras.map((l) => ({ name: l.name, on: true, sm: l.strength ?? 0.8, sc: l.strength ?? 0.8, triggers: [] })) })

export const DEFAULTS = {
  mode: 'text',
  prompt: '',
  character: 'tess',
  aspect: '16:9',
  megapixels: 0.4,
  seconds: 5,
  steps: 8,
  // the preview pass's sampler (KSamplerSelect, node 12) and scheduler (BasicScheduler, node 13); the 2 MP finish
  // keeps its own tuned refine (er_sde, linear_quadratic, 2 steps at 0.4)
  sampler: 'er_sde',
  scheduler: 'beta',
  // 'h3' (MiniMax H3) or PIKA_VARIANT: Pika H3 Flex, its adapter LoRA on the mode's trunk + its six-step schedule
  variant: 'h3',
  // with variant 'pika': the fast stack — SelfLift two-stage sampling, sol-attn sparse attention, the Sol VAE
  fast: false,
  seed: 4242,
  previews: 3,
  overlapFrames: 22,
  media: [],
  voiceLine: null,
  refmods: [],
  retention: 1,
  extraLoras: [],
  // timed beats (beats.js): the shot's direction split into moments, compiled into the prompt
  beats: [],
  // the structured camera pick (camera.js), compiled into the prompt as the camera sentence
  camera: null,
  // the speed preset the shot was made with (speed.js), kept so its finish starts from the preset's finish
  speed: null
}

// request: see DEFAULTS. characters: [{id, name, lora, strength, trigger}]. Returns the plan or throws.
export function planPreviews(request, characters) {
  const r = { ...DEFAULTS, ...request }
  const errors = []
  const mode = MODES[r.mode]
  if (!mode) errors.push(`Unknown mode "${r.mode}". Use ${Object.keys(MODES).join(', ')}.`)
  if (!ASPECTS[r.aspect]) errors.push(`Unknown aspect "${r.aspect}". Use ${Object.keys(ASPECTS).join(', ')}.`)
  if (!(r.megapixels >= 0.1 && r.megapixels <= 2.5)) errors.push('megapixels must be between 0.1 and 2.5.')
  if (!(r.seconds >= 1 && r.seconds <= 15)) errors.push('seconds must be between 1 and 15.')
  if (!r.prompt?.trim()) errors.push('A prompt is required.')
  if (!/^[\w.+-]{1,60}$/.test(String(r.sampler || ''))) errors.push(`Unknown sampler "${r.sampler}".`)
  if (!/^[\w.+-]{1,60}$/.test(String(r.scheduler || ''))) errors.push(`Unknown scheduler "${r.scheduler}".`)
  if (!['h3', PIKA_VARIANT].includes(r.variant)) errors.push(`Unknown variant "${r.variant}". Use h3 or ${PIKA_VARIANT}.`)
  const character = r.character === 'none' ? null : characters.find((c) => c.id === r.character)
  if (r.character !== 'none' && !character) errors.push(`Unknown character "${r.character}".`)
  // a RefMod character (refmods.js) is RefMod 1, ahead of any RefMods picked for the shot; a LoRA character loads its LoRA
  const refChar = character && !character.lora && character.refmod ? character : null
  const refmods = refChar ? [{ name: refChar.refmod, strength: refChar.strength ?? 1, copies: 1 }, ...r.refmods.filter((m) => m.name !== refChar.refmod)] : r.refmods
  const pictures = r.media.filter((m) => m.kind === 'picture')
  const videos = r.media.filter((m) => m.kind === 'video')
  // keyframes: { positions } (Keyframes, one take): 2 to 6 pictures anchored at those frames by H3 Multishot's H3Keyframes
  const keyframes = r.keyframes && r.mode === 'frames' ? r.keyframes : null
  if (keyframes) {
    if (pictures.length < 2 || pictures.length > KEYFRAME_MAX) errors.push(`A one-take keyframes shot needs 2 to ${KEYFRAME_MAX} pictures.`)
    if (!Array.isArray(keyframes.positions) || keyframes.positions.length !== pictures.length) errors.push('Give one keyframe position per picture.')
  } else if (r.mode === 'frames' && (pictures.length < 1 || pictures.length > 2)) errors.push('First / last frame needs 1 picture (first frame) or 2 (first and last).')
  if (r.mode === 'continue' && pictures.length > 1) errors.push('Continue a video takes one picture at most: where the new part ends.')
  if (r.mode === 'reference' && !r.media.length && !refmods.length) errors.push('Reference to video needs at least one picture, video or audio reference, or a RefMod.')
  if (r.mode === 'continue' && videos.length !== 1) errors.push('Continue a video needs exactly one source video.')
  if (r.mode === 'continue' && ![5, 22, 39, 56].includes(r.overlapFrames)) errors.push('Overlap frames must be 5, 22, 39 or 56.')
  if (refmods.length > 8) errors.push(refChar ? 'At most 7 RefMods with a RefMod character (it takes the first).' : 'At most 8 RefMods.')
  // timed beats (beats.js): cleaned here, kept on the request, and compiled into the prompt the model reads.
  // The motion style (contract.js) is cleaned first — it gates which motion principles a beat may direct.
  let beats = []
  let motionStyle = DEFAULT_MOTION_STYLE
  try {
    motionStyle = cleanMotionStyle(r.motion_style) || DEFAULT_MOTION_STYLE
    beats = cleanBeats(r.beats, r.seconds, { motionStyle })
  } catch (e) {
    errors.push(e.message)
  }
  // the Shot Contract's intent and locks (contract.js): same treatment — cleaned, kept on the request,
  // read by the compiler and the take review
  let intent = null
  let locks = null
  try {
    intent = cleanIntent(r.intent)
    locks = cleanLocks(r.locks)
  } catch (e) {
    errors.push(e.message)
  }
  // the contract's transport fields, when a planner sends them, must match what this studio renders
  if (Number.isFinite(Number(r.seconds))) {
    if (r.fps != null && Number(r.fps) !== 24) errors.push('The contract\'s fps is 24 here; leave fps out.')
    if (r.duration_frames != null && Number(r.duration_frames) !== resolveFrames(r.seconds)) {
      errors.push(`duration_frames ${r.duration_frames} isn't what ${r.seconds}s renders here (${resolveFrames(r.seconds)} frames on H3's grid); leave it out or use ${resolveFrames(r.seconds)}.`)
    }
  }
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { errors })
  r.beats = beats
  r.motion_style = motionStyle
  r.camera = cleanCamera(r.camera)
  r.intent = intent
  r.locks = locks
  // Pika's six-step schedule is fixed: the steps a speed preset set only feed the record and the estimates now.
  // Fast is a Pika option; silently off for anything else (the UI only offers it there).
  if (r.variant === PIKA_VARIANT) r.steps = 6
  r.fast = r.variant === PIKA_VARIANT && !!r.fast

  // Continue makes one take for the app's own chains (Extend, one-take film shots, sequences); a shot from Create
  // (continueFull) hunts 1-3 takes like any other and finishes at full size (planFinish)
  const previews = r.mode === 'continue' && !r.continueFull ? 1 : Math.min(3, Math.max(1, Math.round(r.previews)))
  const size = resolveSize(r.aspect, r.megapixels)
  const frames = resolveFrames(r.seconds)
  const groups = [mode.group, character && !refChar ? 'char_tess' : 'char_none', 'select1']
  for (let k = 1; k <= previews; k++) groups.push(`preview${k}`)
  if (r.voiceLine) groups.push('voice')
  if (refmods.length) groups.push('refmods')

  const values = {
    // what the model reads: the camera sentence, then the brief, then the beats' timeline and the contract's intent
    '87': withBeats(withCamera(r.prompt, r.camera), beats, { intent, locks, motionStyle }),
    '501.aspect_ratio': ASPECTS[r.aspect],
    '501.megapixels': r.megapixels,
    '82': r.seconds,
    '503': r.steps,
    // standard Pika takes the lcm sampler of its released schedule; the fast stack's SelfLift wants plain euler
    '12.sampler_name': r.variant === PIKA_VARIANT ? (r.fast ? 'euler' : 'lcm') : r.sampler,
    '13.scheduler': r.scheduler,
    '81.seed': r.seed,
    // fast: decode the takes through the experimental Sol VAE (the video VAE node 3; audio VAE untouched)
    ...(r.fast ? { '3.vae_name': PIKA_SOL_VAE } : {}),
    // Pika's adapter loads first, at its released strength 1; Looks LoRAs the shot carries chain after it
    '410.LoraLoaderState': loraState([...(r.variant === PIKA_VARIANT ? [{ name: PIKA_LORA[mode.model], strength: 1 }] : []), ...r.extraLoras])
  }
  if (refChar) values['1004'] = refChar.name
  else if (character) {
    // the character's main H3 LoRA, and any more its bible loads with it (bible.js models.h3.loras)
    values['1001.LoraLoaderState'] = loraState([{ name: character.lora, strength: character.strength }, ...(character.models?.h3?.loras || [])])
    values['1002'] = character.trigger
  }
  const mediaNode = { frames: '202', reference: '302', continue: '602' }[r.mode]
  if (mediaNode) values[`${mediaNode}.media_state`] = JSON.stringify(r.media.map(mediaItem))
  if (r.mode === 'continue') values['604'] = r.overlapFrames
  if (r.voiceLine) values['801.audio'] = r.voiceLine
  // a continued shot with a picture ends on it (Keyframes' carried motion): the picture is H3's last frame
  if (r.mode === 'continue' && pictures.length === 1) values['611.last_frame'] = ['603', 0]
  // one take through several keyframes: node 204 (H3's first/last frame) becomes H3 Multishot's H3Keyframes, fed by
  // the pictures in order at their frame positions; same outputs (conditioning, latent), so the rest of the graph stays
  const patch = {}
  if (keyframes) patch[204] = { class_type: 'H3Keyframes', remove: ['first_frame', 'last_frame'], inputs: { positions: keyframes.positions.map((n) => String(Math.round(n))).join(', '), ...Object.fromEntries(pictures.map((_, k) => [`image_${k + 1}`, ['203', k]])) } }
  if (r.variant === PIKA_VARIANT && !r.fast) {
    // Pika's schedule: the preview samplers' BasicScheduler (13) becomes ManualSigmas with the released six-step
    // values. Every preview take reads sigmas from [13:0] (15, 115, 125), so one swap covers them all; the finish's
    // own tuned refine (24/25) is untouched, and node 503's steps value is left feeding nothing.
    patch[13] = { class_type: 'ManualSigmas', remove: ['model', 'steps', 'denoise', 'scheduler'], inputs: { sigmas: PIKA_SIGMAS } }
  }
  if (r.fast) {
    // The speed stack, spliced onto the template: sage attention ahead of the core sparse node, the node switched
    // to sol-attn (its 'sla' keep-percent widget gives way to sol-attn's tau), and each preview take's latent cache
    // fed by its own SelfLift two-stage sampler instead of the stock SamplerCustomAdvanced (15/115/125 stay in the
    // graph, unexecuted orphans). Sigmas come from the stock BasicScheduler (13, beta, the forced 6 steps) and the
    // sampler from node 12 (euler, set above) — the released 2-stage workflows' wiring. The positive conditioning
    // is where the guider gets it from: the RefModApply node with RefMods on, its pass-through without (graph.js
    // bypasses those nodes the same way).
    const positive = refmods.length ? '1103' : '402'
    patch[FAST_NODES.sage] = { class_type: 'MiniMaxH3MemoryEfficientSageAttentionPatch', inputs: { model: ['7', 0] } }
    patch[FAST_NODES.zero] = { class_type: 'ConditioningZeroOut', inputs: { conditioning: [positive, 0] } }
    for (const t of FAST_NODES.takes.slice(0, previews)) {
      patch[t.add] = {
        class_type: 'SelfLiftH3Sampler',
        inputs: {
          model: ['8', 0],
          positive: [positive, 0],
          negative: [FAST_NODES.zero, 0],
          vae: ['3', 0],
          latent_image: ['806', 0],
          sampler: ['12', 0],
          sigmas: ['13', 0],
          // the seed rides in the patch: values only reach nodes the template already has, and this node is spliced
          // in afterwards — without it ComfyUI refuses the prompt (required input missing: seed)
          seed: r.seed + t.dy,
          cfg: 1,
          transition_step: 3,
          lowres_scale: 0.5,
          rho: 0,
          w_min: 0.5,
          w_max: 1,
          upscaler_model: H3_LATENT_UPSCALER,
          highres_tiling: false,
          upscaler_unload: true
        }
      }
      patch[t.cache] = { inputs: { samples: [t.add, 0] } }
    }
    patch[8] = { inputs: { model: [FAST_NODES.sage, 0], selection: 'sol-attn', 'selection.tau': 1.3 }, remove: ['selection.keep_percent'] }
  }
  if (refmods.length) {
    for (let k = 1; k <= 8; k++) {
      const m = refmods[k - 1]
      values[`1101.mod_${k}`] = m ? m.name : '(none)'
      values[`1101.strength_${k}`] = m ? (m.strength ?? 1) : 1
      values[`1101.copies_${k}`] = m ? (m.copies ?? 1) : 1
    }
    values['1102'] = r.retention
  }
  return {
    request: r,
    groups,
    values,
    ...(Object.keys(patch).length ? { patch } : {}),
    resolved: { ...size, frames, seconds: +(frames / 24).toFixed(3), fps: 24, previews, model: mode.model, variant: r.variant, fast: r.fast, seeds: [r.seed, r.seed + 1000, r.seed + 2000].slice(0, previews) }
  }
}

// A finish re-uses the preview plan's groups and values unchanged (so the picked latent's fingerprint
// matches and IV Latent Cache skips re-sampling), keeping only the picked preview and adding the upscale.
// The finish's enhancer: DLSS 5 (in the graph: noise reduction, RTX 2x, frame generation) or SeedVR2 (a step after
// a DLSS-free finish, to a short side of enhanceResolution).
export const ENHANCERS = ['dlss', 'seedvr2']
export const SEEDVR2_SIZES = [1080, 1440, 2160]
export function planFinish(previewPlan, finish) {
  const f = { candidate: 1, megapixels: 2, upscale2x: false, fps: 0, audio: 'pass', rerollSeed: null, enhancer: 'dlss', enhanceResolution: 1080, ...finish }
  // SeedVR2 instead of DLSS 5: the finish skips DLSS (no 2x, no frame generation) and SeedVR2 follows it
  if (f.enhancer === 'seedvr2') Object.assign(f, { upscale2x: false, fps: 0 })
  const errors = []
  if (!ENHANCERS.includes(f.enhancer)) errors.push(`enhancer must be ${ENHANCERS.join(' or ')}.`)
  if (f.enhancer === 'seedvr2' && !SEEDVR2_SIZES.includes(f.enhanceResolution)) errors.push(`enhanceResolution must be ${SEEDVR2_SIZES.join(', ')}.`)
  const n = previewPlan.resolved.previews
  if (!(f.candidate >= 1 && f.candidate <= n)) errors.push(`candidate must be 1..${n}.`)
  if (!FRAME_GEN_FPS.includes(f.fps)) errors.push(`fps must be one of ${FRAME_GEN_FPS.join(', ')} (0 = off).`)
  if (!(f.megapixels >= 0.5 && f.megapixels <= 4)) errors.push('megapixels must be between 0.5 and 4.')
  if (f.audio === 'voice' && !previewPlan.request.voiceLine) errors.push('Final audio "voice" needs a voice line.')
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { errors })

  // Continue: the app's own chains finish in one pass at preview size (DLSS only, 'single'). A Create shot
  // (continueFull) gets the full finish: the picked take's 2 MP pass (its frame-free continuation conditioning,
  // node 611), with the source scaled to that size and joined back on before it ('continue_full'), so the
  // final is the whole continued video. continueFinish: 'single' keeps the old one-pass finish for such a shot.
  const cont = previewPlan.request.mode === 'continue'
  const full = cont && !!previewPlan.request.continueFull && f.continueFinish !== 'single'
  const single = cont && !full
  const keep = previewPlan.groups.filter((g) => !/^preview\d$|^select\d$/.test(g))
  const groups = [...keep, `preview${f.candidate}`, `select${f.candidate}`, single ? 'single' : 'upscale']
  if (full) groups.push('continue_full')
  if (!single && f.audio === 'preview') groups.push('audio_preview')
  if (!single && f.audio === 'voice') groups.push('audio_voice')
  const values = { ...previewPlan.values, '504': f.megapixels, '511': f.upscale2x ? 2 : 1, '512': f.fps }
  if (cont) {
    // the continued video (source + take) is built from the picked take, not always take 1
    const decode = { 1: ['40', '41'], 2: ['116', '117'], 3: ['126', '127'] }[f.candidate]
    values['615.image2'] = [decode[0], 0]
    values['617.audio2'] = [decode[1], 0]
  }
  if (full) {
    values['30.images'] = ['632', 0]
    values['30.audio'] = ['633', 0]
  }
  // DLSS 5's noise reduction (0-2) and style, when the finish asks for them
  if (f.dlssStrength != null && Number.isFinite(Number(f.dlssStrength))) values['50.NR Intensity'] = Math.min(2, Math.max(0, Number(f.dlssStrength)))
  if (['Default', 'Natural', 'Cinematic'].includes(f.dlssStyle)) values['50.NR Style'] = f.dlssStyle
  if (f.rerollSeed != null) values['505.seed'] = f.rerollSeed
  else values['505.seed'] = previewPlan.request.seed + 444
  const { width, height } = previewPlan.resolved
  const base = single ? { width, height } : resolveFinalSize(width, height, f.megapixels)
  const scale = f.enhancer === 'seedvr2' ? f.enhanceResolution / Math.min(base.width, base.height) : f.upscale2x ? 2 : 1
  const frames = previewPlan.resolved.frames
  return {
    ...(previewPlan.patch ? { patch: previewPlan.patch } : {}),
    finish: f,
    groups,
    values,
    resolved: {
      width: Math.round((base.width * scale) / 2) * 2,
      height: Math.round((base.height * scale) / 2) * 2,
      enhancer: f.enhancer,
      ...(f.enhancer === 'seedvr2' ? { finishWidth: base.width, finishHeight: base.height } : {}),
      // what the latent upscaler makes, before DLSS or SeedVR2 (remote.js hands it to ComfyUI's built-in upscaler)
      ...(single ? {} : { upscaleSize: { width: base.width, height: base.height } }),
      fps: f.fps || 24,
      frames: f.fps ? Math.round((frames / 24) * f.fps) : frames,
      seconds: previewPlan.resolved.seconds,
      singlePass: single,
      ...(full ? { continued: true } : {})
    }
  }
}

function mediaItem(m) {
  const base = { kind: m.kind, file: `${m.file} [input]`, name: m.file.split('/').pop(), duration: m.duration ?? null, width: m.width ?? null, height: m.height ?? null, uid: m.file.slice(-10) }
  if (m.kind === 'video') return { ...base, has_audio: m.hasAudio ?? true, audio_mode: 'paired' }
  return { ...base, has_audio: m.kind === 'audio', audio_mode: 'off' }
}
