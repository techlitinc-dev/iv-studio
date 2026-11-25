// My workflows: the person's own ComfyUI workflows, run from Techlit Studio like its own tools.
// They bring a workflow saved in API format (ComfyUI: Settings → Dev mode Options on, then "Save (API
// format)"); the app reads it once:
//   params   every input worth a control — prompts, texts, numbers, seeds, switches, media files, model
//            names — each one hideable, so the form shows only what matters
//   needs    the node classes and model files the graph uses, so the page can say what's missing before
//            anything runs (models the cloud knows are mirrored to the pod by cloudprep.js at submit)
// Running fills the graph with the form's values, stages the picked media into ComfyUI's input, and queues
// it like any other job: this PC's ComfyUI or the person's own cloud, whose pod still shuts itself off
// after its idle minutes (the Cloud page's setting).
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const MODEL_FILE = /\.(safetensors|gguf|sft|pth|pt|ckpt|bin)$/i
// Media loader classes: [parameter kind, the input that takes the file]. VHS_LoadVideoPath is staged and
// swapped to VHS_LoadVideo at run time, the way the editor's retake sends a clip (studio.js videoSource).
const MEDIA = {
  LoadImage: ['picture', 'image'],
  LoadAudio: ['audio', 'audio'],
  VHS_LoadVideo: ['video', 'video'],
  LoadVideo: ['video', 'file'],
  VHS_LoadVideoPath: ['video', 'video']
}
// Loader inputs that name a model file: shown as model pickers and listed in the needs panel.
const MODEL_INPUTS = new Set(['unet_name', 'clip_name', 'clip_name1', 'clip_name2', 'vae_name', 'vae_name2', 'lora_name', 'ckpt_name', 'model_name'])
const SEED_INPUTS = new Set(['seed', 'noise_seed'])
// Save classes whose outputs a run collects (anything else saves nothing the page could show).
const SAVE_CLASSES = /^(SaveImage|SaveVideo|SaveAudio|SaveAudioMP3|SaveAudioOpus|VHS_VideoCombine|SaveAnimatedWEBP|PreviewAny|PreviewImage)$/

const API_HELP = 'In ComfyUI turn on Dev mode (Settings → Dev mode Options), then use "Save (API format)" and bring that file.'

// A workflow JSON -> { graph, params, needs }. Throws, in words, when the file isn't an API-format workflow.
export function parseFlow(json) {
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json)
    } catch {
      throw new Error(`That file isn't JSON. ${API_HELP}`)
    }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`That file isn't a ComfyUI workflow. ${API_HELP}`)
  if (Array.isArray(json.nodes) || json.links) throw new Error(`That's the editor's workflow file, not the API one. ${API_HELP}`)
  const ids = Object.keys(json)
  if (!ids.length || !ids.every((id) => json[id] && typeof json[id] === 'object' && typeof json[id].class_type === 'string' && json[id].inputs && typeof json[id].inputs === 'object'))
    throw new Error(`That file isn't a ComfyUI API workflow. ${API_HELP}`)
  const params = []
  const models = new Map()
  const classes = new Set()
  for (const id of ids) {
    const n = json[id]
    classes.add(n.class_type)
    const title = n._meta?.title || n.class_type
    for (const [input, value] of Object.entries(n.inputs)) {
      if (Array.isArray(value) || value === null || typeof value === 'object') continue // a link from another node
      const base = { key: `${id}.${input}`, node: id, input, class: n.class_type, title }
      const media = MEDIA[n.class_type]
      if (media && input === media[1]) params.push({ ...base, kind: media[0], value: typeof value === 'string' ? value : '' })
      else if (typeof value === 'boolean') params.push({ ...base, kind: 'toggle', value })
      else if (typeof value === 'number') params.push({ ...base, kind: SEED_INPUTS.has(input) ? 'seed' : 'number', value })
      else if (typeof value === 'string' && MODEL_INPUTS.has(input)) {
        if (MODEL_FILE.test(value)) models.set(value, { file: value, loader: n.class_type })
        params.push({ ...base, kind: 'model', value })
      } else if (typeof value === 'string') {
        const long = value.length > 60 || /^(text|prompt)$/i.test(input) || /text ?encode/i.test(n.class_type)
        params.push({ ...base, kind: long ? 'prompt' : 'text', value })
      }
    }
  }
  const saves = ids.filter((id) => SAVE_CLASSES.test(json[id].class_type))
  if (!saves.length) throw new Error('This workflow saves nothing Techlit Studio could show. Add a Save node (SaveImage, SaveVideo, VHS Video Combine or SaveAudio).')
  return { graph: json, params, needs: { classes: [...classes].sort(), models: [...models.values()], saves } }
}

// The graph with the form's values in place (untouched keys keep the JSON's own). Media values go in as
// given: run() replaces a path on this PC with its staged name; anything else names a file ComfyUI has.
export function fillFlow(graph, params, values = {}) {
  const g = JSON.parse(JSON.stringify(graph))
  for (const p of params) {
    const v = values[p.key]
    if (v === undefined || v === '') continue
    if (p.kind === 'number' || p.kind === 'seed') {
      const n = Number(v)
      if (Number.isFinite(n)) g[p.node].inputs[p.input] = n
    } else if (p.kind === 'toggle') g[p.node].inputs[p.input] = !!v
    else g[p.node].inputs[p.input] = String(v)
  }
  return g
}

export class CustomFlows {
  constructor({ dataDir, studio }) {
    this.dir = path.join(dataDir, 'customflows')
    fs.mkdirSync(this.dir, { recursive: true })
    this.studio = studio
  }
  file(id) {
    return path.join(this.dir, `${id}.json`)
  }
  list() {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const w = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))
          return { id: w.id, name: w.name, createdAt: w.createdAt, controls: w.params.filter((p) => !(w.hidden || []).includes(p.key)).length, models: w.needs.models.length }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }
  get(id) {
    const w = JSON.parse(fs.readFileSync(this.file(id), 'utf8'))
    return { ...w, hidden: w.hidden || [] }
  }
  importFlow({ name, json }) {
    const parsed = parseFlow(json)
    const w = { id: randomUUID().slice(0, 8), name: String(name || 'My workflow').trim() || 'My workflow', createdAt: new Date().toISOString(), hidden: [], ...parsed }
    fs.writeFileSync(this.file(w.id), JSON.stringify(w, null, 1))
    return w
  }
  update(id, patch = {}) {
    const w = this.get(id)
    if (patch.name !== undefined) w.name = String(patch.name).trim() || w.name
    if (Array.isArray(patch.hidden)) w.hidden = patch.hidden.filter((k) => w.params.some((p) => p.key === k))
    fs.writeFileSync(this.file(id), JSON.stringify(w, null, 1))
    return w
  }
  delete(id) {
    fs.rmSync(this.file(id), { force: true })
  }
  // The needs panel's live half: which node classes the ComfyUI (or the cloud's saved copy of one) doesn't have.
  async check(id) {
    const w = this.get(id)
    const comfy = this.studio().comfy
    const missing = []
    for (const cls of w.needs.classes) {
      const info = await comfy.objectInfo(cls).catch(() => null)
      if (!info || !Object.keys(info).length) missing.push(cls)
    }
    return { missingClasses: missing }
  }
  // The form's values -> a queued job. Media params holding a path on this PC are staged into ComfyUI's
  // input; a path loader becomes an upload loader (its inputs carry over, as in studio.js's videoSource).
  async run(id, values = {}) {
    const w = this.get(id)
    const studio = this.studio()
    const g = fillFlow(w.graph, w.params, values)
    for (const p of w.params.filter((x) => ['picture', 'video', 'audio'].includes(x.kind))) {
      const v = values[p.key]
      if (!v || typeof v !== 'string' || !fs.existsSync(v)) continue
      g[p.node].inputs[p.input] = await studio.comfy.upload(v, 'iv_studio/flows')
      if (p.class === 'VHS_LoadVideoPath') g[p.node].class_type = 'VHS_LoadVideo'
    }
    return studio.submitGraph({ kind: 'flow', graph: g, name: w.name, plan: { custom: true, resolved: {} } })
  }
}
