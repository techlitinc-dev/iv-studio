// Create → Video → MiniMax H3 → Version: Pika H3 Flex (plan.js). Standard: the adapter LoRA leads the shot's
// LoRA chain at strength 1, the preview samplers' scheduler (13) becomes ManualSigmas with Pika's released
// six-step values, and the sampler is lcm. Fast: the speed stack splices in — sage attention ahead of the core
// BlockSparseAttention node, the node switched to sol-attn, one SelfLiftH3Sampler per take feeding the take's
// latent cache, an empty (zeroed) negative, and the Sol VAE on the video VAE node. Base H3 shots are untouched.
//   node test/pika-flex.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildPrompt, checkPrompt } from '../src/service/graph.js'
import { applyPatch, PIKA_LORA, PIKA_SOL_VAE, planFinish, planPreviews } from '../src/service/plan.js'

const template = JSON.parse(fs.readFileSync('resources/workflows/iv_studio_api.json', 'utf8'))
const meta = JSON.parse(fs.readFileSync('resources/workflows/iv_studio_api.groups.json', 'utf8'))
let n = 0
const ok = (cond, name) => (assert.ok(cond, name), n++, console.log('ok', name))
const built = (plan) => applyPatch(buildPrompt(template, meta, plan.groups, plan.values), plan.patch)
const base = { mode: 'text', prompt: 'A test shot.', character: 'none' }

// standard Pika
const p = planPreviews({ ...base, variant: 'pika' }, [])
ok(p.request.steps === 6 && p.resolved.variant === 'pika', 'Pika forces its six steps and records the variant')
ok(p.values['12.sampler_name'] === 'lcm', 'standard Pika takes the lcm sampler')
ok(p.patch['13'].class_type === 'ManualSigmas' && p.patch['13'].inputs.sigmas.startsWith('1.0, 0.972973') && p.patch['13'].remove.includes('scheduler'), 'the preview scheduler (13) becomes ManualSigmas with Pika’s released sigmas')
const loras = JSON.parse(p.values['410.LoraLoaderState']).loras
ok(loras[0].name === PIKA_LORA.fl2va && loras[0].sm === 1, 'the fl2va adapter leads the LoRA chain at strength 1')
const pg = built(p)
ok(checkPrompt(pg).length === 0, 'the standard Pika graph has no dangling links')
ok(pg['13'].inputs.sigmas === p.patch['13'].inputs.sigmas && !('scheduler' in pg['13'].inputs), 'the built graph carries the ManualSigmas swap')

// fast Pika
const f = planPreviews({ ...base, variant: 'pika', fast: true, seed: 7 }, [])
ok(f.request.fast === true && f.resolved.fast === true, 'fast is kept for a Pika shot')
ok(f.values['12.sampler_name'] === 'euler' && !f.patch['13'], 'fast takes plain euler on the stock BasicScheduler (no ManualSigmas)')
ok(f.values['3.vae_name'] === PIKA_SOL_VAE, 'fast decodes through the Sol VAE (video VAE node 3)')
ok(f.patch['1202'].inputs.seed === 7 && f.patch['1203'].inputs.seed === 1007 && f.patch['1205'].inputs.seed === 2007, 'each take’s SelfLift gets its own seed in the patch (values never reach spliced nodes)')
const fg = built(f)
ok(checkPrompt(fg).length === 0, 'the fast graph has no dangling links')
ok(fg['8'].class_type === 'BlockSparseAttention' && fg['8'].inputs.selection === 'sol-attn' && fg['8'].inputs['selection.tau'] === 1.3 && !('selection.keep_percent' in fg['8'].inputs), 'the core sparse node (8) switches from sla to sol-attn')
ok(JSON.stringify(fg['8'].inputs.model) === JSON.stringify(['1201', 0]) && fg['1201'].class_type === 'MiniMaxH3MemoryEfficientSageAttentionPatch' && JSON.stringify(fg['1201'].inputs.model) === JSON.stringify(['7', 0]), 'the sage patch splices in ahead of the sparse node (7 → sage → 8)')
ok(fg['1202'].class_type === 'SelfLiftH3Sampler' && JSON.stringify(fg['1202'].inputs.model) === JSON.stringify(['8', 0]) && JSON.stringify(fg['1202'].inputs.negative) === JSON.stringify(['1204', 0]) && fg['1202'].inputs.cfg === 1 && fg['1202'].inputs.seed === 7 && fg['1202'].inputs.upscaler_model === 'minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors', 'each take samples with SelfLift on the patched model, a zeroed negative, cfg 1, its own seed and the H3 latent upscaler')
ok(JSON.stringify(fg['151'].inputs.samples) === JSON.stringify(['1202', 0]) && JSON.stringify(fg['152'].inputs.samples) === JSON.stringify(['1203', 0]) && JSON.stringify(fg['153'].inputs.samples) === JSON.stringify(['1205', 0]), 'the takes’ latent caches read the SelfLift samplers')
ok(fg['1204'].class_type === 'ConditioningZeroOut' && JSON.stringify(fg['1204'].inputs.conditioning) === JSON.stringify(['402', 0]), 'without RefMods the empty negative zeroes the raw conditioning (402)')
const fr = planPreviews({ ...base, variant: 'pika', fast: true, mode: 'reference', character: 'r1', media: [{ kind: 'picture', file: 'a.png' }] }, [{ id: 'r1', name: 'R', refmod: 'characters/r_audio', strength: 1 }])
const frg = built(fr)
ok(checkPrompt(frg).length === 0 && JSON.stringify(frg['1204'].inputs.conditioning) === JSON.stringify(['1103', 0]) && JSON.parse(frg['410'].inputs.LoraLoaderState).loras[0].name === PIKA_LORA.ref2va, 'with RefMods (reference mode) the zeroed negative uses the RefModApply output (1103), and the ref2va adapter loads')
const one = planPreviews({ ...base, variant: 'pika', fast: true, previews: 1 }, [])
ok(one.patch['1202'] && !one.patch['1203'] && !one.patch['1205'] && one.patch['151'] && !one.patch['152'], 'one preview splices one SelfLift and rewires one cache')
ok(built(one) && checkPrompt(built(one)).length === 0, 'a single-take fast graph is sound')
const kf = planPreviews({ ...base, variant: 'pika', fast: true, mode: 'frames', keyframes: { positions: [0, 60] }, media: [{ kind: 'picture', file: 'a.png' }, { kind: 'picture', file: 'b.png' }] }, [])
ok(kf.patch['204']?.class_type === 'H3Keyframes' && kf.patch['1202'], 'keyframes and the fast stack compose in one patch')
ok(checkPrompt(built(kf)).length === 0, 'the keyframes+fast graph is sound')
const fin = planFinish(f, { candidate: 1 })
ok(fin.patch['1202'] && fin.patch['8'] && fin.values['12.sampler_name'] === 'euler', 'a finish of a fast take keeps the whole stack')

// guard rails
const b = planPreviews({ ...base, fast: true }, [])
ok(b.request.fast === false && !b.patch && b.values['3.vae_name'] === undefined && b.values['12.sampler_name'] === 'er_sde', 'fast on base H3 is ignored (plain H3 render)')
assert.throws(() => planPreviews({ ...base, variant: 'flux' }, []), /Unknown variant/)
n++
console.log('ok an unknown variant is refused')
ok(planPreviews({ ...base, variant: 'pika', fast: true, steps: 20 }, []).request.steps === 6, 'Pika keeps the six-step schedule whatever the request says')
console.log(`pika-flex: ${n} checks passed`)
