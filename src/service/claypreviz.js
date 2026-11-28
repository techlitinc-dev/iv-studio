// Clay previz (its own sidebar page): a shot filmed as a full greybox — everything plain grey blocks and
// mannequins, like a Blender viewport in solid mode — by MiniMax H3 on the same template graph Create hunts
// with (plan.js + graph.js); then a realism pass paints the real scene over the blocks (h3refine.js's refine
// graph), keeping the motion. Fully separate from Create's H3 flow and from the staging-board previs (previs.js):
// its own runs in the data folder, its own IPC. It only borrows the pure builders and Studio's generic
// submitGraph/refreshJob, so nothing here changes how shots, finishes or effects render.
import fs from 'node:fs'
import path from 'node:path'
import { applyPatch, planPreviews } from './plan.js'
import { buildPrompt } from './graph.js'
import { refineGraph } from './h3refine.js'

// The look every take is prompted with: a full greybox, like a Blender viewport in solid shading mode — the
// WHOLE scene (people and world alike) is plain untextured grey geometry: mannequin people, block buildings,
// block furniture, no colour, no textures, no realistic materials. The realism pass then paints the real scene
// over the blocks, keeping the motion. H3 has no negative prompt, so the style sentence carries the whole look,
// ending with the keep-it-grey clause.
export const CLAY_STYLE =
  'A greybox 3D previz, exactly like a Blender viewport in solid shading mode: the whole scene — people, furniture, buildings, vehicles, trees, ground and sky — is plain untextured grey geometry, matte light-grey clay with simple flat shading and soft ambient occlusion, no colour anywhere, no textures, no realistic materials. People are smooth grey mannequins with blank faces and segmented ball joints; objects and rooms are simple grey block shapes. From first frame to last everything stays monochrome grey clay; nothing becomes realistic or coloured. '

// H3 renders 1 to 15 seconds (plan.js); the page offers the usual previz lengths inside that.
export const PREVIZ_SECONDS = { min: 2, max: 15 }
// Take n's video is saved by this node of Techlit Studio's template (studio.js's PREVIEW_SAVES).
const TAKE_SAVES = { 1: '42', 2: '118', 3: '128' }

// How hard the realism pass repaints. A greybox take is all grey — colour, materials and light are all invented
// by the pass — so it needs more strength than a Seedance draft's finish (studio.js's light 0.1 / medium 0.2);
// more strength also means more steps.
export const REALISM = [
  { id: 'subtle', label: 'Subtle', about: 'Stays closest to the greybox motion; lighter detail', denoise: 0.5, steps: 2 },
  { id: 'balanced', label: 'Balanced', about: 'Real surfaces and light; the motion holds', denoise: 0.65, steps: 3 },
  { id: 'full', label: 'Full', about: 'The most H3 detail; small moves can drift', denoise: 0.8, steps: 4 }
]
export const realismLevel = (id) => REALISM.find((x) => x.id === id) || REALISM[1]

const slug = (s) => String(s || 'previz').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'previz'
const MODEL_FILE = /\.(safetensors|gguf|sft|pth|pt|ckpt|bin)$/i

// The writer's rules for a previz prompt: one flowing paragraph in the order things happen, with the greybox
// constraint and the no-continuity rule built in (a film shot's notes arrive full of both).
export const PREVIZ_WRITER_RULES = `Write one prompt for a video model with sound. Rules:
- One flowing paragraph in the present tense, 4 to 8 sentences, in the order things happen. No headings, lists, tags or section names.
- Start with the shot and the subject (who or what, where). Then the action, step by step, with the camera's own movement. Then the sound: the room, the effects, and any music.
- Everything in the shot is a plain grey 3D block or mannequin, like a Blender previz: describe what happens and where, never colours, materials, lighting mood or realistic detail — the greybox style is added later.
- Spoken words go in double quotes after who says them and how ("she says quietly, \\"...\\""). Only the words the idea gives.
- Nothing the camera can't see: no feelings without a visible sign, no backstory. No continuity with other shots ("the previous shot", "as before"): this shot stands alone.
- When a first frame is given, the shot starts exactly on it: describe what moves from there.`

// A previz request as an H3 preview plan (plan.js), the greybox look baked into the prompt. Text, or first/last
// frame when pictures are given; the realism pass later reads the plain prompt, without the greybox words.
export function planPreviz(request = {}) {
  const prompt = String(request.prompt || '').trim()
  if (!prompt) throw new Error('Describe the shot first.')
  const media = (request.media || []).filter((m) => m.kind === 'picture' && (m.file || m.path))
  const seconds = Math.min(PREVIZ_SECONDS.max, Math.max(PREVIZ_SECONDS.min, Number(request.seconds) || 5))
  return planPreviews(
    {
      character: 'none',
      ...request,
      mode: media.length ? 'frames' : 'text',
      prompt: CLAY_STYLE + prompt,
      media,
      seconds,
      seed: Number.isInteger(Number(request.seed)) ? Number(request.seed) : Math.floor(Math.random() * 1e9)
    },
    []
  )
}

// The takes' graph: the same template graph a Create shot hunts with (graph.js), named for the run — node 80
// is the save name every preview's filename prefix is built from.
export function takeGraph(template, meta, plan, { name = 'previz' } = {}) {
  plan.values['80'] = name
  return applyPatch(buildPrompt(template, meta, plan.groups, plan.values), plan.patch)
}

// The realism graph for one take: h3refine's graph with two changes of our own — the source arrives through
// ComfyUI's input folder (VHS_LoadVideo), so the same graph runs on this PC and on a cloud pod (a PC path
// would mean nothing to a pod), and DLSS is left out (it is this PC only). video: the uploaded file's name.
export function realismGraph(template, { source, prompt, character = null, trigger = '', name, seed = 4686, unet = null, level = 'balanced', video }) {
  const l = realismLevel(level)
  const { graph, resolved } = refineGraph(template, { source, prompt, character, trigger, name, seed, unet, dlss: false, denoise: l.denoise, steps: l.steps })
  graph.load = { class_type: 'VHS_LoadVideo', inputs: { video, force_rate: 24, custom_width: 0, custom_height: 0, frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1, format: 'AnimateDiff' } }
  return { graph, resolved: { ...resolved, level: l.id, denoise: l.denoise, steps: l.steps } }
}

// Model files a graph names that the connected ComfyUI doesn't list: [label]. Compared by basename, both sides
// normalised: the template writes Windows backslashes (MiniMax H3\…), a cloud ComfyUI lists forward slashes.
// Character LoRAs inside a Pixaroma state string are the person's own and upload on demand (cloudprep.js), so
// they aren't checked here.
export function missingModels(graph, info) {
  const base = (x) => String(x).replace(/\\/g, '/').split('/').pop()
  const out = []
  for (const node of Object.values(graph)) {
    const spec = info[node.class_type]
    if (!spec) continue
    for (const [k, v] of Object.entries(node.inputs || {})) {
      if (typeof v !== 'string' || !MODEL_FILE.test(v)) continue
      const def = spec.input?.required?.[k] || spec.input?.optional?.[k]
      const opts = Array.isArray(def?.[0]) ? def[0] : def?.[0] === 'COMBO' && Array.isArray(def?.[1]?.options) ? def[1].options : null
      if (opts && !opts.some((o) => base(o) === base(v))) out.push(v)
    }
  }
  return [...new Set(out)]
}

export class ClayPreviz {
  // studio: () => Studio. writer: () => the person's prompt writer ({ engine, model }, paths.js writerOf).
  // Runs live in the data folder's claypreviz folder.
  constructor({ dataDir, studio, writer }) {
    this.dir = path.join(dataDir, 'claypreviz')
    this.studio = studio
    this.writer = writer || (() => ({ engine: 'local' }))
  }

  runsFile = () => path.join(this.dir, 'runs.json')
  runs() {
    try {
      return JSON.parse(fs.readFileSync(this.runsFile(), 'utf8'))
    } catch {
      return []
    }
  }
  record(r) {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(this.runsFile(), JSON.stringify([r, ...this.runs().filter((x) => x.id !== r.id)].slice(0, 500), null, 1))
  }
  deleteRun(id) {
    const r = this.runs().find((x) => x.id === id)
    if (!r) throw new Error(`No run ${id}.`)
    for (const f of r.files || []) fs.rmSync(f.file, { force: true })
    fs.writeFileSync(this.runsFile(), JSON.stringify(this.runs().filter((x) => x.id !== id), null, 1))
    return { deleted: id }
  }

  // The shot's words as one clean paragraph, for the page's "Write it for me" button and for film shots
  // arriving prefilled: a full film prompt (staging, look, wardrobe, continuity) is distilled to what a greybox
  // previz needs — the place, what happens, the camera, the spoken line — with the people kept as mannequins
  // (the greybox style itself is added at render time, so the writer must not describe skin, hair or clothes).
  async write({ prompt, seconds = 5, first = null }) {
    if (!String(prompt || '').trim()) throw new Error('Describe the shot first.')
    const studio = this.studio()
    const writer = this.writer()
    const { askWriter } = await import('./filmcraft.js')
    const images = []
    if (first && fs.existsSync(first)) {
      const { jpegOf } = await import('./prompter.js')
      images.push({ name: 'first-frame.jpg', data: await jpegOf({ file: first }) })
    }
    const user = [
      `The shot, from the film's notes:\n${String(prompt).trim()}`,
      `Length: about ${Math.round(seconds)} seconds.`,
      images.length ? 'The shot starts exactly on the attached first frame: describe what you see in it, then what moves.' : '',
      'Answer as JSON: { "prompt": "..." }.'
    ].filter(Boolean).join('\n')
    const cpu = writer?.engine === 'local' && (await studio.gpuBusy().catch(() => false))
    const out = await askWriter(writer, { system: PREVIZ_WRITER_RULES, user, schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] }, cpu, temperature: 0.6, images })
    const text = String(out?.prompt || '').trim()
    if (!text) throw new Error('The writer gave no prompt back. Try again.')
    return text
  }

  // Whether the connected ComfyUI can do both halves, in words: the template graph for the takes and the
  // refine stack for the realism pass, checked against what it lists (no GPU is woken for this).
  async status() {
    const studio = this.studio()
    const out = { h3: { ready: false }, ready: false }
    if (studio.comfy.hosted) {
      out.blocked = 'Previz runs on this PC’s ComfyUI or your own cloud (RunPod, Modal), not on Comfy Cloud.'
      return out
    }
    try {
      const info = await studio.comfy.objectInfo()
      const take = takeGraph(studio.template, studio.meta, planPreviz({ prompt: 'x', seconds: 5, previews: 1, seed: 1 }), { name: 'x' })
      const real = realismGraph(studio.template, { source: { path: 'x', width: 672, height: 384, frames: 121, fps: 24 }, prompt: 'x', name: 'x', video: 'x.mp4' }).graph
      const missingNodes = [...new Set([...Object.values(take), ...Object.values(real)].map((n) => n.class_type).filter((c) => !info[c]))]
      // on the person's own cloud a catalog model the volume lacks is downloaded when the render is submitted
      // (cloudprep.js), so only this PC's ComfyUI is held to having every file already
      const missingFiles = studio.comfy.prep ? [] : [...new Set([...missingModels(take, info), ...missingModels(real, info)])]
      out.h3.ready = !missingNodes.length && !missingFiles.length
      if (missingNodes.length) out.h3.error = `Needs ComfyUI nodes this one doesn’t have (${missingNodes.slice(0, 4).join(', ')}). Update ComfyUI in Settings → Setup.`
      else if (missingFiles.length) out.h3.error = `Needs ${missingFiles.join(', ')}. Download on Setup.`
    } catch (err) {
      out.h3.error = err.message
    }
    out.ready = out.h3.ready
    return out
  }

  // ComfyUI finishing a job, reported as it goes; throws unless it succeeded.
  async wait(jobId, onProgress) {
    const studio = this.studio()
    let j = null
    for (const end = Date.now() + 60 * 60e3; Date.now() < end; await new Promise((r) => setTimeout(r, 3000))) {
      j = await studio.refreshJob(jobId)
      onProgress(j)
      if (['success', 'error', 'cancelled'].includes(j.status)) break
    }
    if (j?.status !== 'success') throw new Error(j?.error || `The render ${j?.status || 'took too long'}.`)
    return j
  }

  // A finished job's saved videos, copied into the claypreviz folder (from a cloud pod too): the takes' nodes
  // per TAKE_SAVES, the realism pass's by 'save'. Returns [{ candidate?, label, file, kind }].
  async collect(promptId, nodes, title, stamp) {
    const studio = this.studio()
    const h = (await studio.comfy.history(promptId).catch(() => null))?.[promptId]
    const outputs = h?.outputs || {}
    const files = []
    for (const [node, candidate] of nodes) {
      const v = (outputs[node]?.gifs || []).filter((f) => /\.mp4$/i.test(f.filename)).sort((a, b) => /-audio/.test(b.filename) - /-audio/.test(a.filename))[0]
      if (!v) continue
      const src = await studio.localCopy({ url: studio.comfy.viewUrl(v) }, path.join(this.dir, '_comfy'))
      if (!src || !fs.existsSync(src)) continue
      const dest = path.join(this.dir, `${slug(title)}_${stamp}_${candidate ? `take${candidate}` : 'real'}.mp4`)
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
      if (path.dirname(src) === path.join(this.dir, '_comfy')) fs.rmSync(src, { force: true })
      files.push({ ...(candidate ? { candidate } : {}), label: candidate ? `Take ${candidate}` : 'Made real', file: dest, kind: 'video' })
    }
    return files
  }

  // Step one: the greybox takes. prompt (plain words), aspect, seconds (2-15), takes (1-3), first/last
  // (optional frame pictures on this PC). Resolves when ComfyUI is done, with the run's files.
  async take({ prompt, aspect = '16:9', seconds = 5, takes = 2, first = null, last = null, seed, name, onProgress = () => {} }) {
    const studio = this.studio()
    if (studio.comfy.hosted) throw new Error('Previz runs on this PC’s ComfyUI or your own cloud (RunPod, Modal), not on Comfy Cloud.')
    const media = []
    for (const f of [first, last].filter(Boolean)) media.push({ kind: 'picture', file: await studio.comfy.upload(f, 'iv_studio/previz') })
    const plan = planPreviz({ prompt, aspect, seconds, previews: takes, seed, media })
    const title = String(name || '').trim() || String(prompt).trim().slice(0, 60)
    const stamp = Date.now().toString(36)
    const graph = takeGraph(studio.template, studio.meta, plan, { name: `previz_${stamp}` })
    const info = await studio.comfy.objectInfo()
    const missingNodes = [...new Set(Object.values(graph).map((n) => n.class_type).filter((c) => !info[c]))]
    if (missingNodes.length) throw new Error(`The previz needs ComfyUI nodes this one doesn’t have (${missingNodes.slice(0, 4).join(', ')}). Update ComfyUI in Settings → Setup.`)
    // the cloud downloads a catalog model it lacks when the render is submitted (cloudprep.js); only this PC must have it
    const missingFiles = studio.comfy.prep ? [] : missingModels(graph, info)
    if (missingFiles.length) throw new Error(`The previz needs ${missingFiles.join(', ')}. Download on Setup.`)
    const job = await studio.submitGraph({ kind: 'previz', graph, name: title, plan: { previz: { prompt: String(prompt).trim(), aspect: plan.request.aspect }, resolved: plan.resolved } })
    const run = {
      id: `take_${stamp}`,
      kind: 'take',
      title,
      prompt: String(prompt).trim(),
      plan: { aspect: plan.request.aspect, seconds: plan.resolved.seconds, takes: plan.resolved.previews, frames: media.map((m) => m.file), resolved: plan.resolved },
      jobId: job.id,
      status: 'running',
      files: [],
      createdAt: new Date().toISOString()
    }
    this.record(run)
    try {
      const j = await this.wait(job.id, onProgress)
      const files = await this.collect(j.promptId, plan.resolved.seeds.map((_, i) => [TAKE_SAVES[i + 1], i + 1]), title, stamp)
      if (!files.length) throw new Error('The render finished but saved nothing.')
      const done = { ...run, status: 'success', files, seconds: j.seconds, finishedAt: new Date().toISOString() }
      this.record(done)
      return done
    } catch (err) {
      this.record({ ...run, status: 'error', error: err.message })
      throw err
    }
  }

  // Step two: one take made real. runId + candidate pick the take; level is a REALISM id; characterId (optional)
  // lends the pass that character's H3 LoRA. The prompt is the take's own words, without the greybox look.
  async realism({ runId, candidate = 1, level = 'balanced', characterId = null, onProgress = () => {} }) {
    const studio = this.studio()
    if (studio.comfy.hosted) throw new Error('Previz runs on this PC’s ComfyUI or your own cloud (RunPod, Modal), not on Comfy Cloud.')
    const run = this.runs().find((r) => r.id === runId)
    if (!run || run.kind !== 'take') throw new Error('Pick a previz take first.')
    const take = (run.files || []).find((f) => f.candidate === Number(candidate))
    if (!take || !fs.existsSync(take.file)) throw new Error('That take isn’t on this PC.')
    const info = await studio.comfy.objectInfo()
    const character = characterId ? studio.characters().find((c) => c.id === characterId) : null
    if (characterId && !character) throw new Error('That character is gone.')
    const r = run.plan.resolved
    const video = await studio.comfy.upload(take.file, 'iv_studio/previz')
    const stamp = Date.now().toString(36)
    const name = `${slug(run.title)}_${stamp}_real`
    const { graph, resolved } = realismGraph(studio.template, {
      source: { path: take.file, width: r.width, height: r.height, frames: r.frames, fps: r.fps || 24 },
      prompt: run.prompt,
      character: character?.lora ? character : null,
      trigger: character?.trigger || '',
      name,
      seed: (r.seeds?.[Number(candidate) - 1] ?? 4242) + 444,
      unet: studio.models?.text || null,
      level,
      video
    })
    const missingNodes = [...new Set(Object.values(graph).map((n) => n.class_type).filter((c) => !info[c]))]
    if (missingNodes.length) throw new Error(`The realism pass needs ComfyUI nodes this one doesn’t have (${missingNodes.slice(0, 4).join(', ')}). Update ComfyUI in Settings → Setup.`)
    // the cloud downloads a catalog model it lacks when the render is submitted (cloudprep.js); only this PC must have it
    const missingFiles = studio.comfy.prep ? [] : missingModels(graph, info)
    if (missingFiles.length) throw new Error(`The realism pass needs ${missingFiles.join(', ')}. Download on Setup.`)
    const job = await studio.submitGraph({ kind: 'previz', graph, name: `${run.title} · real`, plan: { previz: { realism: true, of: run.id, candidate: Number(candidate), level: resolved.level }, resolved } })
    const out = { id: `real_${stamp}`, kind: 'realism', title: `${run.title} · real`, prompt: run.prompt, parent: run.id, candidate: Number(candidate), level: resolved.level, characterId: character?.id || null, jobId: job.id, status: 'running', files: [], createdAt: new Date().toISOString() }
    this.record(out)
    try {
      const j = await this.wait(job.id, onProgress)
      const files = await this.collect(j.promptId, [['save', 0]], name, stamp)
      if (!files.length) throw new Error('The render finished but saved nothing.')
      const done = { ...out, status: 'success', files, seconds: j.seconds, finishedAt: new Date().toISOString() }
      this.record(done)
      return done
    } catch (err) {
      this.record({ ...out, status: 'error', error: err.message })
      throw err
    }
  }
}
