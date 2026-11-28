"""IV Studio in the cloud, on the user's own RunPod account: what every IV Studio pod runs.

IV Studio starts a pod from RunPod's official PyTorch image with the user's network volume at /workspace,
passing this folder (packed into the IV_BUNDLE variable, so the pod runs exactly this app version's files)
and the start command `bash -c "<unpack IV_BUNDLE into /opt/iv> && python3 /opt/iv/runpod_boot.py"`.
Standard library only: it runs before anything is installed.

  1. gate.py starts at once on port 8189, so IV Studio can follow the boot through /iv/health
  2. the first time (or after an update changes cloud.json or the node packs): a Python, torch, ComfyUI at its
     pinned tag and every cloud node pack (ivcloud.py), installed into /workspace/iv on the volume, so later
     pods skip it
  3. the models setup needs (H3's) that the volume lacks, downloaded into /workspace/models and checked against
     their SHA-256 (the same list Modal's fetch_models uses). Other models come later, through the gate's
     /iv/fetch, the first time a render needs them
  4. ComfyUI on 127.0.0.1:8188, reading models through extra_model_paths.yaml (/models -> /workspace/models),
     with its input and output folders on the volume
The gate deletes the pod after IV_IDLE_SECONDS with nothing to do; the volume keeps everything.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import ivcloud

HERE = Path(__file__).parent
W = Path("/workspace/iv")
VENV = W / "venv"
PY = VENV / "bin" / "python"
COMFY = W / "comfy"
MODELS = Path("/workspace/models")
STATUS = Path("/tmp/iv-status.json")
COMFY_LOG = Path(os.environ.get("IV_COMFY_LOG", "/tmp/iv-comfy.log"))
COMFY_URL = os.environ.get("IV_COMFY_URL", "http://127.0.0.1:8188")  # settable for tests
# a ComfyUI that hangs while loading is killed after this and the boot fails with its log, not waited on forever
START_TIMEOUT = int(os.environ.get("IV_COMFY_START_TIMEOUT", "900"))
CLOUD, MANIFEST = ivcloud.load(HERE)
PACKS = ivcloud.cloud_packs(MANIFEST)


def status(stage, detail="", **extra):
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps({"stage": stage, "detail": detail, "at": int(time.time()), **extra}))
    tmp.replace(STATUS)
    print(f"[iv] {stage}: {detail}", flush=True)


def sh(cmd, **kw):
    print(f"[iv] $ {cmd}", flush=True)
    subprocess.run(cmd, shell=True, check=True, **kw)


def start_gate():
    try:
        import aiohttp  # noqa: F401
    except ImportError:
        sh(f"{sys.executable} -m pip install -q --break-system-packages aiohttp")
    env = {**os.environ, "IV_PLATFORM": "runpod", "IV_STATUS_FILE": str(STATUS), "IV_MODELS_DIR": str(MODELS), "PYTHONPATH": str(HERE)}
    return subprocess.Popen([sys.executable, str(HERE / "gate.py")], env=env)


def system_packages():
    if shutil.which("ffmpeg") and shutil.which("unzip"):
        return
    status("installing", "system packages (ffmpeg)")
    sh("apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg unzip libgl1 libglib2.0-0 >/dev/null")


def stamp():
    """What the install on the volume must match: this version's cloud.json and cloud node packs."""
    return hashlib.sha256((HERE / "cloud.json").read_bytes() + json.dumps(PACKS, sort_keys=True).encode()).hexdigest()[:16]


def wait_for_other_install():
    """Two pods on one volume must not install at once. A lock older than an hour is a crashed pod's."""
    lock = W / "install.lock"
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, os.environ.get("RUNPOD_POD_ID", "?").encode())
            os.close(fd)
            return lock
        except FileExistsError:
            if time.time() - lock.stat().st_mtime > 3600:
                lock.unlink(missing_ok=True)
                continue
            status("installing", "another IV Studio pod is installing; waiting for it")
            time.sleep(20)


def install():
    W.mkdir(parents=True, exist_ok=True)
    if (W / "stamp").exists() and (W / "stamp").read_text().strip() == stamp() and PY.exists():
        return
    lock = wait_for_other_install()
    try:
        if (W / "stamp").exists() and (W / "stamp").read_text().strip() == stamp() and PY.exists():
            return
        status("installing", "Python and torch (first time only, about 5 minutes)", percent=5)
        if not shutil.which("uv"):
            sh(f"{sys.executable} -m pip install -q --break-system-packages uv")
        shutil.rmtree(VENV, ignore_errors=True)
        shutil.rmtree(COMFY, ignore_errors=True)
        sh(f"uv venv {VENV} --python 3.12 --seed")
        torch = CLOUD["torch"]
        sh(f"uv pip install --python {PY} {' '.join(torch['packages'])} --index-url {torch['index']}")
        comfy = CLOUD["comfyui"]
        status("installing", f"ComfyUI {comfy['tag']}", percent=45)
        sh(f"git clone --depth 1 --branch {comfy['tag']} {comfy['repo']} {COMFY}")
        status("installing", f"ComfyUI {comfy['tag']}: its requirements", percent=55)
        sh(f"grep -viE '^[[:space:]]*(torch|torchvision|torchaudio)([^A-Za-z0-9_.-]|$)' {COMFY}/requirements.txt > /tmp/comfy-req.txt && uv pip install --python {PY} -r /tmp/comfy-req.txt")
        cmds = ivcloud.pack_commands(PACKS, str(COMFY / "custom_nodes"), f"uv pip install --python {PY}")
        downloaded = [p for p in PACKS if not p.get("bundled")]
        for i, p in enumerate(downloaded):
            # packs are the last stretch of the install: 60% → 100% across them
            status("installing", f"node pack {i + 1} of {len(downloaded)}: {p['dir']}", percent=60 + round(((i + 1) / len(downloaded)) * 40) if downloaded else None)
            sh(cmds[2 * i])
            sh(cmds[2 * i + 1])
        (W / "stamp").write_text(stamp())
    finally:
        lock.unlink(missing_ok=True)


def ensure_sage():
    """KJNodes' MiniMax H3 sage attention patch imports sageattention.core — the SageAttention 2 codebase with its
    compiled CUDA kernels. The PyPI `sageattention` wheel is pure-python WITHOUT those kernels (its core import
    fails), so the check is the same import KJNodes runs, not a module lookup. Built for EVERY GPU Techlit Studio
    can land the pod on (a wake may fall back to another card; sm_89 binaries can't run on an H100's sm_90), with a
    marker recording the arch list so an older single-arch build rebuilds by itself. Guarded throughout: --no-deps
    so it can never drag other packages, a free-space floor (a full disk truncates compiles and poisons the venv),
    verify-then-uninstall so a bad build never lingers, and non-fatal — the boot must not stop over it."""
    if not PY.exists():
        return
    probe = "from sageattention.core import per_thread_int8_triton, get_cuda_arch_versions, attn_false"
    marker = VENV / "sage_iv_arches"
    want = "8.0;8.6;8.9;9.0;12.0+PTX"  # A100, L40S, RTX 4090/6000 Ada, H100, RTX 5090 (PTX: forward-compatible)
    if subprocess.run([str(PY), "-c", probe], capture_output=True).returncode == 0 and marker.exists() and marker.read_text().strip() == want:
        return
    try:
        free = shutil.disk_usage("/workspace").free
    except OSError:
        free = 1 << 40
    if free < 8 * (1 << 30):
        status("installing", "sageattention skipped: less than 8 GB free on the volume, and its build needs scratch space. Free some space (Cloud page → storage) and wake again.")
        return
    status("installing", "sageattention 2 (for the fast render's attention patch; a one-time multi-GPU source build, 10–25 min)")
    subprocess.run(f"uv pip install --python {PY} -q ninja", shell=True)
    subprocess.run(f"uv pip uninstall --python {PY} -y sageattention", shell=True)
    r = subprocess.run(
        f"TORCH_CUDA_ARCH_LIST='{want}' uv pip install --python {PY} --no-deps --no-build-isolation 'git+https://github.com/thu-ml/SageAttention.git@v2.2.0'",
        shell=True, capture_output=True, text=True)
    if subprocess.run([str(PY), "-c", probe], capture_output=True).returncode == 0:
        marker.write_text(want)
        status("installing", "sageattention ready (all GPUs)")
    else:
        subprocess.run(f"uv pip uninstall --python {PY} -y sageattention", shell=True)
        tail = "\n".join(((r.stderr or "") + "\n" + (r.stdout or "")).splitlines()[-3:])
        status("installing", f"sageattention failed to build and was removed — fast renders can't use it. {tail[:220]}")


def fetch_models():
    """The models setup needs that the volume lacks (ivcloud.setup_models), each checked against its SHA-256."""
    models = ivcloud.setup_models(CLOUD, MANIFEST)
    have = len(ivcloud.present(models, MODELS))
    token = os.environ.get("HF_TOKEN") or None

    def say(e):
        if e["state"] == "downloading":
            status("models", f"{e['label']} ({e['index']} of {e['count']}), {e['percent']}%", model=e["id"], percent=e["percent"], done=have + e["index"] - 1, total=len(models))
        elif e["state"] == "done":
            print(f"[iv] model ready: {e['label']} (checksum verified)", flush=True)

    ivcloud.fetch([m for m in models if not ivcloud.target(MODELS, m).exists()], MODELS, token=token, progress=say)


def comfy_log_lines():
    """ComfyUI's own output, one entry per line (its \\r progress updates included)."""
    try:
        return [line.strip() for line in COMFY_LOG.read_text(errors="replace").splitlines() if line.strip()]
    except OSError:
        return []


def log_tail(count=8, chars=1200):
    return "\n".join(comfy_log_lines()[-count:])[-chars:]


def start_comfy():
    for p in PACKS:  # the packs that ship inside IV Studio (its own, Viggle Remake's), this version's, every boot
        if p.get("bundled") and (HERE / p["dir"]).exists():
            nodes = COMFY / "custom_nodes" / p["dir"]
            shutil.rmtree(nodes, ignore_errors=True)
            shutil.copytree(HERE / p["dir"], nodes)
    for d in ("input", "output"):
        (W / "data" / d).mkdir(parents=True, exist_ok=True)
    if not Path("/models").exists():
        os.symlink(MODELS, "/models")
    status("starting", "ComfyUI is loading")
    # its own log, so a ComfyUI that won't come up can say why (it used to vanish into the container log)
    log = open(COMFY_LOG, "w", encoding="utf-8", errors="replace")
    return subprocess.Popen(
        [str(PY), str(COMFY / "main.py"), "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch", "--preview-method", "none",
         "--input-directory", str(W / "data" / "input"), "--output-directory", str(W / "data" / "output"),
         "--extra-model-paths-config", str(HERE / "extra_model_paths.yaml")],
        stdout=log, stderr=subprocess.STDOUT,
    )


def wait_ready(proc):
    """Waits for ComfyUI's first answer, mirroring its latest log line into the status so IV Studio shows the
    load happening. A ComfyUI that hangs loading (a stuck node pack, a stalled CUDA init) is killed after
    START_TIMEOUT and the boot fails with the end of its log — before, this waited forever and setup hung."""
    t0, said = time.time(), ""
    while proc.poll() is None:
        try:
            with urllib.request.urlopen(f"{COMFY_URL}/system_stats", timeout=5):
                status("ready", "ComfyUI is ready", pod=os.environ.get("RUNPOD_POD_ID"))
                return True
        except Exception:  # noqa: BLE001 - not up yet
            pass
        lines = comfy_log_lines()
        if lines and lines[-1] != said:
            said = lines[-1]
            status("starting", f"ComfyUI is loading: {said[:140]}")
        if time.time() - t0 > START_TIMEOUT:
            proc.kill()
            proc.wait()
            status("error", f"ComfyUI didn't answer within {max(1, START_TIMEOUT // 60)} minutes, so it was stopped. The end of its log:\n{log_tail() or '(it wrote nothing)'}")
            return False
        time.sleep(3)
    status("error", f"ComfyUI stopped while starting (exit {proc.returncode}). The end of its log:\n{log_tail() or '(it wrote nothing)'}")
    return False


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    status("booting", "starting the gate")
    gate = start_gate()
    try:
        system_packages()
        install()
        ensure_sage()
        fetch_models()
        comfy = start_comfy()
        # only a ComfyUI that came up and then died gets the plain "stopped" line; a failed start keeps its own
        if wait_ready(comfy):
            comfy.wait()
            status("error", f"ComfyUI stopped (exit {comfy.returncode})")
    except Exception as e:  # noqa: BLE001 - the gate stays up so IV Studio can show what went wrong
        status("error", str(e)[:400])
    gate.wait()


if __name__ == "__main__":
    main()
