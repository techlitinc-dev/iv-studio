// Every test that needs no GPU, no ComfyUI and no arguments, one after another: `npm run test:all`.
// The same list runs in CI (scripts/ci-linux.sh keeps its own copy for per-test CI logs — add new tests to both).
// Tests that need media files, the network, the built app or a window stay CI-only (edit-export, site-capture,
// shinobi, mcp-smoke, the window and updater checks); graph-parity needs IV_STUDIO_WORKFLOWS set.
//   node test/run-all.mjs [python-with-aiohttp]
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = [
  'cast', 'music-video', 'keyframes', 'animal-cam', 'issues-49-50', 'bible', 'app-update', 'cutout', 'directing', 'ltx',
  'facerefine', 'editgen', 'news', 'tours', 'lint', 'productions', 'reel', 'screenplay', 'sizzle-cut', 'staging',
  'timeline-tracks', 'private-outputs', 'comfylauncher', 'comfy-busy', 'ranking', 'prompt-guide', 'ollama-address',
  'nodepacks', 'model-versions', 'remake', 'remake-voice', 'rebuild-voice', 'comfycloud', 'image-families', 'refmods',
  'hardware', 'training-recipe', 'training-runpod', 'sampler-choice', 'sequence-links', 'sequence-kinds', 'h3-image',
  'iv-workspace-import', 'live-preview-all', 'latent-cache-key', 'music-remix', 'pricing', 'seedance', 'words',
  'modal-account', 'setup-progress', 'library-facts', 'speed', 'effects', 'comfy-install', 'comfy-address', 'mac-update',
  'credits', 'comfy-starting', 'freefield', 'lora-families', 'comfy-restart', 'openai-writer', 'filmcraft', 'interchange',
  'recommended', 'describe', 'softmouth', 'dailies', 'terms', 'continue-full', 'portable-update', 'chat-extras',
  'picture-setup', 'chat-text', 'hermes-acp', 'ollama-start', 'writer-pick', 'agent-names', 'writer-json', 'codex-images',
  'createmem', 'localchat', 'cloudspend', 'customflows'
]
// These also take a Python with aiohttp for their live gate tests; without one they run their service tests and skip the gate.
const PY_TESTS = ['runpod', 'cloudprep', 'cloudvoice']

const py =
  process.argv[2] ||
  ['python3', 'python'].find((p) => {
    try {
      execFileSync(p, ['-c', 'import aiohttp'], { stdio: 'ignore', windowsHide: true })
      return true
    } catch {
      return false
    }
  })

const results = []
function run(name, args) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 300000, windowsHide: true })
  const good = r.status === 0
  results.push([good, name])
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()
  console.log(`${good ? 'ok  ' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s) — ${out.split('\n').pop() || ''}`)
  if (!good) console.log(out.split('\n').slice(-15).join('\n'))
}

console.log(`test:all — ${TESTS.length + PY_TESTS.length} tests${py ? ` (gate tests on ${py})` : ' (no Python with aiohttp: gate tests skip)'}\n`)
for (const t of TESTS) run(t, [path.join(ROOT, 'test', `${t}.mjs`)])
for (const t of PY_TESTS) run(t, [path.join(ROOT, 'test', `${t}.mjs`), ...(py ? [py] : [])])

const failed = results.filter(([good]) => !good)
console.log(`\n${results.length - failed.length} of ${results.length} tests passed`)
if (failed.length) console.log(`failed: ${failed.map(([, name]) => name).join(', ')}`)
process.exit(failed.length ? 1 : 0)
