// GPT Image through OpenAI's API (src/service/gptimages.js): the routes, sizes, auth and error words, with a
// stand-in fetch.   node test/gptimages.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apiBase, DEFAULT_GPT_MODEL, GPT_MODEL, GPT_MODELS, GPT_SIZES, gptImage, gptImageStatus, gptPicturePrice } from '../src/service/gptimages.js'
import { Images } from '../src/service/images.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

ok('the address normalizes to the API base', () => {
  assert.equal(apiBase(''), 'https://api.openai.com/v1')
  assert.equal(apiBase('https://api.openai.com/v1/'), 'https://api.openai.com/v1')
  assert.equal(apiBase('https://api.openai.com/v1/images'), 'https://api.openai.com/v1')
  assert.equal(apiBase('https://gw.example.com/openai/v1'), 'https://gw.example.com/openai/v1')
})
ok('the default model is the cheapest (Flare); Sunburst is the best quality; every model has a list price', () => {
  assert.equal(DEFAULT_GPT_MODEL, 'gpt-image-2.6-flare')
  assert.deepEqual(GPT_MODELS.map((m) => m.id), ['gpt-image-2.6-flare', 'gpt-image-1-mini', 'gpt-image-1', 'gpt-image-2.6-sunburst'])
  assert.ok(gptPicturePrice('gpt-image-2.6-flare') < gptPicturePrice('gpt-image-1-mini'), 'Flare is the cheapest')
  assert.ok(gptPicturePrice('gpt-image-2.6-sunburst') > gptPicturePrice('gpt-image-1'), 'Sunburst is the dearest')
  assert.equal(gptPicturePrice('gpt-image-9-turbo'), null)
})
ok('every aspect maps to one of gpt-image-1’s three sizes', () => {
  assert.equal(GPT_SIZES['1:1'], '1024x1024')
  assert.equal(GPT_SIZES['16:9'], '1536x1024')
  assert.equal(GPT_SIZES['9:16'], '1024x1536')
})
ok('ready only with a key', () => {
  assert.equal(gptImageStatus({ key: '' }).ready, false)
  assert.match(gptImageStatus({ key: '' }).missing[0], /API key/)
  assert.equal(gptImageStatus({ key: 'sk-x' }).ready, true)
})

await (async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`)))('generate: POST /images/generations with the key, model and size; the b64 comes back as a Buffer', async () => {
  const calls = []
  const fetchImpl = async (url, opts) => (calls.push({ url, opts }), { ok: true, json: async () => ({ data: [{ b64_json: PNG.toString('base64') }] }) })
  const out = await gptImage({ key: 'sk-test', url: '', prompt: 'a red dress', aspect: '16:9', fetchImpl })
  assert.ok(out.equals(PNG))
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations')
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer sk-test')
  const body = JSON.parse(calls[0].opts.body)
  assert.deepEqual(body, { model: 'gpt-image-2.6-flare', prompt: 'a red dress', size: '1536x1024', n: 1 })
})

await (async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`)))('edit: POST /images/edits as multipart with the reference pictures', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-gpt-'))
  const ref = path.join(dir, 'p.png')
  fs.writeFileSync(ref, PNG)
  const calls = []
  const fetchImpl = async (url, opts) => (calls.push({ url, opts }), { ok: true, json: async () => ({ data: [{ b64_json: PNG.toString('base64') }] }) })
  const out = await gptImage({ key: 'sk-test', url: 'https://gw.example.com/v1', prompt: 'make the dress blue', aspect: '1:1', refs: [ref], fetchImpl })
  assert.ok(out.equals(PNG))
  assert.equal(calls[0].url, 'https://gw.example.com/v1/images/edits')
  assert.ok(calls[0].opts.body instanceof FormData)
  assert.equal(calls[0].opts.body.get('model'), 'gpt-image-2.6-flare')
  assert.equal(calls[0].opts.body.get('size'), '1024x1024')
  assert.equal(calls[0].opts.body.getAll('image[]').length, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

await (async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`)))('errors come back in words: the key, the credit, the prompt, the address', async () => {
  const withStatus = (status, message) => async () => ({ ok: false, status, json: async () => ({ error: { message } }) })
  await assert.rejects(gptImage({ key: 'bad', prompt: 'x', fetchImpl: withStatus(401, 'invalid key') }), /refused the API key/)
  await assert.rejects(gptImage({ key: 'k', prompt: 'x', fetchImpl: withStatus(429, 'quota exceeded') }), /out of credit/)
  await assert.rejects(gptImage({ key: 'k', prompt: 'x', fetchImpl: withStatus(400, 'content policy violation') }), /declined the prompt/)
  await assert.rejects(gptImage({ key: 'k', url: 'https://nowhere.example.com/v1', prompt: 'x', fetchImpl: withStatus(404, 'not found') }), /No image API at that address/)
  await assert.rejects(gptImage({ key: 'k', prompt: 'x', fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }) }), /without a picture/)
})

await (async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`)))('the model passes through, and an unknown one falls back to the cheapest', async () => {
  const calls = []
  const fetchImpl = async (url, opts) => (calls.push(JSON.parse(opts.body)), { ok: true, json: async () => ({ data: [{ b64_json: PNG.toString('base64') }] }) })
  await gptImage({ key: 'k', prompt: 'x', model: 'gpt-image-2.6-sunburst', fetchImpl })
  assert.equal(calls[0].model, 'gpt-image-2.6-sunburst')
  await gptImage({ key: 'k', prompt: 'x', model: 'gpt-image-9-turbo', fetchImpl })
  assert.equal(calls[1].model, 'gpt-image-2.6-flare')
})

ok('gptSpend: billed pictures summed per film tag at the list prices, for the dashboard', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-gptspend-'))
  const imgs = new Images({ studio: null, dataDir: dir })
  imgs.saveAll([
    { id: 'a', engine: 'gptimage', model: 'gpt-image-2.6-flare', files: ['1.png', '2.png'], tag: 'film:f1' },
    { id: 'b', engine: 'gptimage', model: 'gpt-image-2.6-sunburst', files: ['3.png'], tag: 'film:f2' },
    { id: 'c', engine: 'gptimage', model: 'gpt-image-2.6-flare', files: [], tag: 'film:f1' }, // nothing made: nothing billed
    { id: 'd', engine: 'codex', model: 'x', files: ['4.png'] } // not GPT Image
  ])
  const s = imgs.gptSpend()
  assert.equal(s.pictures, 3)
  assert.ok(Math.abs(s.usd - (2 * gptPicturePrice('gpt-image-2.6-flare') + gptPicturePrice('gpt-image-2.6-sunburst'))) < 1e-9)
  assert.equal(s.byTag['film:f1'].pictures, 2)
  assert.ok(Math.abs(s.byTag['film:f2'].usd - gptPicturePrice('gpt-image-2.6-sunburst')) < 1e-9)
  fs.rmSync(dir, { recursive: true, force: true })
})

console.log(`\n${n} passed`)
