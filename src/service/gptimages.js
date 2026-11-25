// GPT Image through OpenAI's API (gpt-image-1): pictures made and edited on the person's own OpenAI API key —
// pay per picture, no ComfyUI, no GPU, no Codex install. Generate is POST /images/generations (JSON); with
// reference pictures it's POST /images/edits (multipart). The answer's b64_json comes back as a Buffer; the
// caller (images.js) saves and crops it like any other family's picture. The address can point at a proxy or
// Azure-style gateway that serves the same routes.
import fs from 'node:fs'

// The models the API serves for pictures, cheapest first: the default is the cheapest. All share the same
// routes, sizes and edit shape. perPicture: OpenAI's list price per picture (2026-11-25), for the dashboards'
// cost figures — Flare is made for sketches and drafts, Sunburst is the best quality.
export const GPT_MODELS = [
  { id: 'gpt-image-2.6-flare', label: 'GPT Image 2.6 Flare', note: 'Cheapest: made for sketches and drafts, about a fifth of Mini’s price.', perPicture: 0.002 },
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini', note: 'The previous cheap one: very close to GPT Image 1 in quality.', perPicture: 0.011 },
  { id: 'gpt-image-1', label: 'GPT Image 1', note: 'The previous generation’s best.', perPicture: 0.042 },
  { id: 'gpt-image-2.6-sunburst', label: 'GPT Image 2.6 Sunburst', note: 'The best quality OpenAI makes, the dearest.', perPicture: 0.09 }
]
export const DEFAULT_GPT_MODEL = GPT_MODELS[0].id
export const GPT_MODEL = DEFAULT_GPT_MODEL
export const gptModelOk = (m) => GPT_MODELS.some((x) => x.id === m)
// What one picture with this model costs on the account (null for a model without a listed price)
export const gptPicturePrice = (m) => GPT_MODELS.find((x) => x.id === m)?.perPicture ?? null
// gpt-image-1 makes exactly three sizes; each of Techlit Studio's aspects maps to the nearest
export const GPT_SIZES = { '1:1': '1024x1024', '16:9': '1536x1024', '4:3': '1536x1024', '3:2': '1536x1024', '9:16': '1024x1536', '3:4': '1024x1536', '2:3': '1024x1536' }

// "https://api.openai.com/v1/", "https://api.openai.com/v1/images" -> the API base the routes hang off
export const apiBase = (url) =>
  String(url || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/images(\/.*)?$/, '') || 'https://api.openai.com/v1'

export function gptImageStatus({ key } = {}) {
  const has = !!String(key || '').trim()
  return { ready: has, missing: has ? [] : ['an OpenAI API key (Settings → GPT Image API)'] }
}

async function answered(res) {
  if (res.ok) return res.json()
  const body = await res.json().catch(() => ({}))
  const msg = body?.error?.message || `HTTP ${res.status}`
  if (res.status === 401 || res.status === 403) throw new Error('OpenAI refused the API key. Check it in Settings → GPT Image API.')
  if (res.status === 429) throw new Error(`OpenAI: ${/quota|billing|credit/i.test(msg) ? 'the account is out of credit' : 'too many requests right now, try again in a minute'}.`)
  if (res.status === 400 && /content|policy|safety|moderation/i.test(msg)) throw new Error(`OpenAI declined the prompt: ${msg}`)
  if (res.status === 404) throw new Error(`No image API at that address. Check the URL in Settings → GPT Image API (it should serve /v1/images/generations).`)
  throw new Error(`OpenAI: ${msg}`)
}

// One picture. refs: paths of pictures to edit from (the first is the one changed, the rest references).
// Returns a Buffer (PNG). fetchImpl is for tests.
export async function gptImage({ key, url, model = DEFAULT_GPT_MODEL, prompt, aspect = '1:1', refs = [], fetchImpl = fetch, timeoutMs = 240000 }) {
  const base = apiBase(url)
  const size = GPT_SIZES[aspect] || GPT_SIZES['1:1']
  const auth = { Authorization: `Bearer ${String(key || '').trim()}` }
  let res
  if (refs.length) {
    const form = new FormData()
    form.set('model', gptModelOk(model) ? model : DEFAULT_GPT_MODEL)
    form.set('prompt', String(prompt || ''))
    form.set('size', size)
    for (const [i, f] of refs.entries()) form.append('image[]', new Blob([fs.readFileSync(f)], { type: 'image/png' }), `reference-${i + 1}.png`)
    res = await fetchImpl(`${base}/images/edits`, { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(timeoutMs) })
  } else {
    res = await fetchImpl(`${base}/images/generations`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: gptModelOk(model) ? model : DEFAULT_GPT_MODEL, prompt: String(prompt || ''), size, n: 1 }),
      signal: AbortSignal.timeout(timeoutMs)
    })
  }
  const data = await answered(res)
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI answered without a picture.')
  return Buffer.from(b64, 'base64')
}
