// Clay previz (src/service/claypreviz.js): the greybox plan and graphs on MiniMax H3, without ComfyUI.
//   node test/claypreviz.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CLAY_STYLE, PREVIZ_SECONDS, REALISM, missingModels, planPreviz, realismGraph, realismLevel, takeGraph } from '../src/service/claypreviz.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
// every [node, slot] input points at a node in the graph
const linked = (g) => {
  for (const [id, node] of Object.entries(g)) for (const [k, v] of Object.entries(node.inputs)) if (Array.isArray(v) && typeof v[0] === 'string') assert.ok(g[v[0]], `${id}.${k} points at ${v[0]}, which isn't there`)
}

// Techlit Studio's real H3 template and group map, as the app loads them (studio.js)
const template = JSON.parse(fs.readFileSync(new URL('../resources/workflows/iv_studio_api.json', import.meta.url), 'utf8'))
const meta = JSON.parse(fs.readFileSync(new URL('../resources/workflows/iv_studio_api.groups.json', import.meta.url), 'utf8'))

// the H3 template's loaders' and samplers' inputs, for the realism graph (h3refine.js reads these nodes)
const refineTemplate = {
  2: { inputs: { clip_name: 'qwen3vl_32b.safetensors', type: 'minimax' } },
  3: { inputs: { vae_name: 'minimax_h3_video_vae.safetensors' } },
  4: { inputs: { vae_name: 'minimax_h3_audio_vae.safetensors' } },
  101: { inputs: { unet_name: 'minimax_h3.safetensors', weight_dtype: 'default' } },
  5: { inputs: { lora_name: 'h3_turbo.safetensors', strength_model: 1 } },
  7: { inputs: { attention_backend: 'sage' } },
  8: { inputs: { block_size: 128 } },
  21: { inputs: { upscale_method: 'nearest' } },
  24: { inputs: { sampler_name: 'euler' } },
  25: { inputs: { scheduler: 'simple', steps: 2, denoise: 0.4 } },
  30: { inputs: { frame_rate: 24, loop_count: 0, filename_prefix: 'H3/refined/x', format: 'video/h264-mp4', pix_fmt: 'yuv420p', crf: 16, save_metadata: true, trim_to_audio: false, pingpong: false, save_output: true } }
}
const source = { path: '/takes/clay.mp4', width: 864, height: 480, frames: 121, fps: 24 }

ok('the plan is H3’s own preview plan, with the greybox look baked into the prompt', () => {
  const p = planPreviz({ prompt: 'A fox crosses the road.', aspect: '16:9', seconds: 8, previews: 3, seed: 7 })
  assert.ok(p.request.prompt.startsWith(CLAY_STYLE))
  assert.ok(p.request.prompt.endsWith('A fox crosses the road.'))
  assert.equal(p.request.character, 'none', 'no character LoRA in a greybox')
  assert.deepEqual([p.resolved.width, p.resolved.height], [864, 480], 'the 0.4 MP preview size')
  assert.deepEqual(p.resolved.seeds, [7, 1007, 2007])
  assert.ok(p.groups.includes('char_none') && !p.groups.includes('char_tess'))
  assert.throws(() => planPreviz({ prompt: '  ' }), /Describe the shot/)
})

ok('lengths clamp to H3’s 2-15 seconds; frames mode needs a picture and stages it', () => {
  assert.equal(planPreviz({ prompt: 'x', seconds: 60 }).request.seconds, PREVIZ_SECONDS.max)
  assert.equal(planPreviz({ prompt: 'x', seconds: 1 }).request.seconds, PREVIZ_SECONDS.min)
  const p = planPreviz({ prompt: 'x', media: [{ kind: 'picture', file: 'iv_studio/previz/a.png' }, { kind: 'video', file: 'v.mp4' }] })
  assert.ok(p.groups.includes('mode2'), 'first/last frame mode')
  const state = JSON.parse(p.values['202.media_state'])
  assert.equal(state.length, 1, 'only the picture is staged')
  assert.equal(state[0].file, 'iv_studio/previz/a.png [input]')
})

ok('the takes’ graph is the template’s own hunt graph, named for the run', () => {
  const p = planPreviz({ prompt: 'A fox.', seconds: 5, previews: 2, seed: 7 })
  const g = takeGraph(template, meta, p, { name: 'previz_x1' })
  linked(g)
  assert.equal(g['80'].inputs.value, 'previz_x1', 'the save name')
  assert.ok(g['87'].inputs.value.startsWith(CLAY_STYLE), 'the style leads the prompt')
  assert.ok(!g['202'], 'text mode: no media loader')
  assert.equal(g['81'].inputs.seed, 7)
})

ok('the look is a full greybox: everything grey blocks, no colour, like a Blender viewport', () => {
  assert.match(CLAY_STYLE, /greybox/i)
  assert.match(CLAY_STYLE, /[Bb]lender viewport/)
  assert.match(CLAY_STYLE, /no colour/i)
  assert.match(CLAY_STYLE, /block/i)
  assert.match(CLAY_STYLE, /mannequin/i)
  assert.match(CLAY_STYLE, /stays monochrome grey clay/i, 'the keep-it-grey clause (H3 has no negative prompt)')
  assert.doesNotMatch(CLAY_STYLE, /fully real|photographed|colour grade/i, 'not the coloured-world look')
})

ok('the model check matches names across slash styles (the cloud lists posix, the template writes Windows)', () => {
  const graph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: 'MiniMax H3\\minimax_h3_fl2va_pruned_int8_convrot.safetensors' } },
    turbo: { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'MiniMax H3\\Turbo\\minimax_h3_DMAD_4step_full_lora_avg_rank_39_bf16.safetensors' } },
    other: { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'nope.safetensors' } },
    text: { class_type: 'PrimitiveString', inputs: { value: 'a prompt, not a model.safetensors really' } }
  }
  const info = {
    UNETLoader: { input: { required: { unet_name: [['MiniMax H3/minimax_h3_fl2va_pruned_int8_convrot.safetensors']] } } },
    LoraLoaderModelOnly: { input: { required: { lora_name: [['MiniMax H3/Turbo/minimax_h3_DMAD_4step_full_lora_avg_rank_39_bf16.safetensors']] } } },
    PrimitiveString: { input: { required: { value: ['STRING'] } } }
  }
  assert.deepEqual(missingModels(graph, info), ['nope.safetensors'], 'only the genuinely absent file is named')
})

ok('the realism levels: unknown ids fall back to balanced', () => {
  assert.equal(realismLevel('full').denoise, 0.8)
  assert.equal(realismLevel('nonsense').id, 'balanced')
  for (const l of REALISM) assert.ok(l.steps >= 2 && l.denoise >= 0.5, 'an all-grey take needs real strength to become a scene')
})

ok('the realism graph reads the take from ComfyUI’s input folder, keeps its sound, and has no DLSS', () => {
  const { graph, resolved } = realismGraph(refineTemplate, { source, prompt: 'A fox.', name: 'x', video: 'clay_take1.mp4', level: 'balanced' })
  linked(graph)
  assert.equal(graph.load.class_type, 'VHS_LoadVideo', 'a pod has no PC paths')
  assert.equal(graph.load.inputs.video, 'clay_take1.mp4')
  assert.equal(graph.load.inputs.force_rate, 24)
  assert.ok(!graph.dlss && !graph.out, 'DLSS is this PC only')
  assert.deepEqual(graph.save.inputs.audio, ['load', 2], 'the take’s own sound rides along')
  assert.equal(graph.sigmas.inputs.denoise, 0.65)
  assert.equal(graph.sigmas.inputs.steps, 3)
  assert.equal(graph.up.inputs['mode.megapixels'], 2)
  assert.equal(resolved.level, 'balanced')
  assert.equal(resolved.frames, 121)
})

ok('each level sets its own strength and steps; the character LoRA joins the pass', () => {
  for (const l of REALISM) {
    const { graph } = realismGraph(refineTemplate, { source, prompt: 'A fox.', name: 'x', video: 'v.mp4', level: l.id })
    assert.equal(graph.sigmas.inputs.denoise, l.denoise)
    assert.equal(graph.sigmas.inputs.steps, l.steps)
  }
  const { graph } = realismGraph(refineTemplate, { source, prompt: 'A fox.', name: 'x', video: 'v.mp4', character: { lora: 'hero.safetensors', strength: 0.8, name: 'Hero' } })
  assert.ok(graph.char.inputs.LoraLoaderState.includes('hero.safetensors'))
  const none = realismGraph(refineTemplate, { source, prompt: 'A fox.', name: 'x', video: 'v.mp4' })
  assert.ok(!none.graph.char.inputs.LoraLoaderState.includes('hero'))
})
