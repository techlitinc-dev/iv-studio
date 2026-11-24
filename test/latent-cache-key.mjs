// Runs test/latent-cache-key.py (Techlit Studio's own ComfyUI pack: the take cache looks through the live preview) with
// whichever Python this machine has. Plain Python 3, no packages.
//   node test/latent-cache-key.mjs
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pythons = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']
let ran = false
for (const py of pythons) {
  let out
  try {
    execFileSync(py, ['--version'], { stdio: 'ignore' })
  } catch {
    continue
  }
  out = execFileSync(py, [path.join(here, 'latent-cache-key.py')], { encoding: 'utf8' })
  process.stdout.write(out)
  ran = true
  break
}
if (!ran) {
  console.error('No Python found to run latent-cache-key.py')
  process.exit(1)
}
