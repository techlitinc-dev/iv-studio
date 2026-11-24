# Techlit Studio — Making a Feature-Length Film (In-Depth Tutorial)

A complete workflow for taking a feature film — up to 8 hours, ~1,000+ shots — from one sentence of an idea to a finished, scored, assembled movie on a **PC with no graphics card**. Writing runs on this machine through Hermes; every render executes on a GPU in **your own RunPod account**.

> Who this is for: you have the custom "Techlit Studio" build (DD'S Techlit AI Solutions branding), a Kimi API key inside Hermes, and a RunPod account. If a step references a button that isn't there, update the app — this tutorial matches the current build.

---

## 0. The setup (once)

| Piece | Where | State you need |
|---|---|---|
| Kimi API key | In **Hermes's own config** (`hermes config set model.api_key …`) or the first-run wizard | Hermes answers (test: `hermes status`) |
| RunPod API key | First-run wizard or **Cloud page → Guided Setup** | Key validated, provider = RunPod |
| GPU pick | Cloud wizard's live list | Pick a **"free now"** card (busy ones are disabled; price-capped fallback protects you) |
| MiniMax H3 terms | **Settings → About → Terms of use** | Accepted once |
| Storage | **Settings → Data folder** → move to your biggest drive | 300–500 GB free for a full feature |

First render note: the first time you render, the app creates your RunPod volume and a pod that **installs ComfyUI + ~60 GB of models onto it** (~30 minutes, billed by the second). Every session after that wakes in a couple of minutes and the models are already there.

---

## 1. The mental model — manage reels, not shots

A 2-hour film is ~1,000 shots at ~7 seconds each. Nobody can manage 1,000 items in a list. The app is built so you only ever touch **one reel at a time**:

```
Feature (the film, up to 480 min)
 └─ Act I … Act N            ← structure and pacing (auto-sized)
     └─ Sequence             ← one place-and-time reel, 1–8 min, 20–40 shots — this is YOUR unit of work
         └─ Scene            ← one screenplay scene
             └─ Shot         ← one 3–10 s camera take: action, camera, dialogue, H3 prompt
```

- The **feature page** is the cockpit: acts with minutes, shots finished per act, footage minutes, percent complete.
- The **story explorer** is the map: the whole film as an interactive mindmap — click any node for its full contents, drag nodes, double-click to jump into the shot/sequence, colors show written → filmed → finished.
- Everything hands-on happens **inside one sequence** (an ordinary Projects page).

Rule of thumb: **a sequence should fail small.** If a reel is wrong, you re-do 30 shots, not 1,000.

---

## 2. Phase 1 — Plan the whole film with AI

1. **Dashboard → FEATURE FILM** → title, one-line logline, length (up to 480 min), aspect → *Start a feature*. You get a three-act skeleton.
2. Open the feature and paste your **Story** (the treatment: what happens, act by act, named characters). One page of prose is plenty; the richer it is, the better the plan.
3. Click **Plan everything**. Hermes now writes, in order:
   - the **act structure** (1–5 acts, titled, sized to your target),
   - the **sequences** — each created as a Project and attached to its act in order, with a title and a one-line logline,
   - the **cast** — every character with a name, role, and visual description, written into *every* sequence so all scripts speak of the same people,
   - then **every screenplay, scene, shot, dialogue line, and H3 prompt** (plus outfits, character descriptions, and place prompts).
4. Watch the feature page: sequences appear under their acts, progress ticks up. A 2-minute film plans in ~5 minutes; a 120-minute film's *writing* takes hours — it's fully resumable, so spread it out.

**Reviewing the plan (do this before rendering anything):**
- Read the feature's acts/sequences list — does the story divide the way you feel it?
- Open **Story explorer**: are the acts balanced? Any sequence that's obviously too big (split it: remove it, add two)?
- Check the **cast** list on the feature page — rename anyone the AI misnamed (edit the treatment and **Re-plan everything**, or just fix names as you review scripts).

> **Total control variant:** add sequences by hand (title + logline per act) and use the per-sequence **Write** button instead of **Write scripts & shots** — write one reel, read it, then write the next.

---

## 3. Phase 2 — Review the writing (sample, don't read 1,000 shots)

Hermes wrote ~1,000 prompts. You are the showrunner; review by sampling:

1. **Per sequence, read the script** (Projects → the sequence → Story step). Fix dialogue that sounds wrong — the shot list is regenerated from the script structure you keep.
2. **Check 3–5 shots per sequence**: the opening shot, any dialogue shot, one action shot. Their prompts carry the location, outfits, staging, camera, and the exact spoken line.
3. **Dialogue coverage is guaranteed**: the app ensures every scripted line lands word-for-word in exactly one shot (`keepLines`), so you only review phrasing, not coverage.
4. **Characters and places are already written**: made-up characters carry AI-written visual descriptions (fed into every shot of them); each place got an **establishing-shot prompt**. On a film page: **Character prompts / Place prompts / Establishing shots** buttons (the last one inserts a 5-second wide "where we are" shot at the head of each scene — do this once per sequence, before filming).
5. Anything odd → edit the shot's prompt directly (click the shot in the storyboard) or hit the per-shot rewrite.

> Tip: fix problems at the **sequence** level (re-run its Write with a tweaked logline) rather than hand-editing 30 prompts.

---

## 4. Phase 3 — Filming at scale (the expensive phase)

This is where money moves. Plan it in **acts**, not movies.

### Economics first

Roughly: 1 shot ≈ preview hunt (Fast preset ~1 min GPU) + finish (~2 min GPU) ≈ **3 GPU-minutes**. 1,000 shots ≈ **50–100 GPU-hours**. On a 4090-class card ($0.89/h) that's **$45–90**; on an L40S ($1.09/h) **$55–110**. Halve it by hunting at Fast/Low and finishing at 1 MP + 2× instead of 2 MP.

### Discipline that saves the most money

1. **Hunt small, finish rarely.** Previews exist to be rejected. Never finish a shot you haven't watched at preview size.
2. **Batch by scene**: the film page renders a whole scene in one click; the queue shows progress and can cancel.
3. **One act at a time**: finish act one's sequences, rough-cut them, *then* move to act two. A pacing problem found at minute 10 costs 30 re-shots, not 400.
4. **The pod is billed by the second and shuts itself off** when idle. Long renders: fine. Coffee breaks: it idles off; next render wakes it in ~2 minutes from your warm volume.
5. **Pick GPUs from the live list** (Cloud wizard): only "free now" cards are selectable, cheapest first, and the app will never substitute a card much above your pick without asking.

### The per-shot loop (inside a sequence)

Shot → **Hunt** (previews render on RunPod, pick the best take) → **Finish** (the picked take at full size + DLSS). Dialogue shots get the character's voice automatically when the voice engine is set up on the pod. Finished shots appear in the sequence's cut and the mindmap turns green.

### Storage

Every preview and final lands in your data folder. A full feature realistically needs **300–500 GB**. Set **Settings → Data folder** to a big drive *before* Phase 3. (Pruning old previews after finishing is a manual cleanup today — see Roadmap.)

---

## 5. Phase 4 — Assembly, score, trailer

1. **Rough cut per sequence** as its shots finish (one click on the film page) — you get a watchable reel per sequence immediately.
2. **Songs** (feature page panel): describe the music ("genre, mood, instruments, voice, tempo"), paste lyrics for sung themes — rendered on RunPod. Make the theme once, reuse it; make the score per act if you like.
3. **Trailer** (feature page panel): paste any web address — a promo plan is built from the page first, then your footage. Do it after act one; it's your proof-of-concept.
4. **Master cut** (feature page): assembles every sequence's cut into one edit, in running order, and opens it in the editor. Titles, songs, and sound go here. Export from the editor.

---

## 6. Phase 5 — The fix loop (retakes, changes, continuity)

- **A shot is bad**: re-hunt it (new seeds) or re-finish a different take. The old takes stay in the shot's history.
- **A line changed**: edit the shot's line; its prompt updates with the exact words (`withLine`); re-film that shot only.
- **A character's look changed** (outfit/hair across the film): change it in the cast step and re-run **Character prompts**, then rewrite that character's shot prompts — today this is per-shot; bulk re-prompt by character is on the Roadmap.
- **A sequence plays wrong**: re-write just that sequence (its logline + Write), re-film its shots, re-cut.

---

## 7. Working with an agent (the 1,000-shot force multiplier)

Any MCP client (Kimi Code, Claude Code…) with the `techlit-studio` server gets the whole studio as tools. A typical overnight session:

```
plan_feature        → acts + sequences + cast + all writing
generate_feature    → anything not yet written
generate_previews   → batch a scene's shots (loop over the shot list from explore_feature)
feature_stats       → morning report: shots written/filmed/finished per act
feature_master_cut  → assembly when an act completes
```

The agent can crash or be stopped at any point; everything on disk resumes cleanly. This is the practical way to render hundreds of shots: the agent queues scene batches, watches the queue, and reports stuck shots — you review footage, not progress bars.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Hermes didn't answer in the expected shape" | Hermes has no model key, or the model hiccuped | `hermes config set model.api_key <key>`; retry |
| Writer stalls >10 min | Hermes cold start / big script | wait; kill and retry; check `hermes status` |
| "No GPU within about $X/h … free" | Your pick (and near-price cards) are busy | Retry later or pick another GPU — the app refuses to silently charge more |
| First render takes 30+ min | One-time ComfyUI + model install on your volume | Normal; watch the Cloud page's boot log |
| "MiniMax H3 needs your OK" | Terms not accepted | Settings → About → Terms of use |
| Renders wake the wrong/slow GPU | Wizard pick didn't save | Cloud page → re-pick a "free now" GPU |
| Disk filling | Previews + finals accumulate | Move the data folder to a bigger drive; delete old preview takes in finished shots |
| Breakdown stuck "running" | Writer call hung | Open the sequence → the drawer retries the shot; or re-run Write |

---

## 9. Honest limits & roadmap

Built for big films, these are the seams at true 1,000-shot scale (each is a known, buildable item):

1. **Render-all-unrendered per sequence** — today rendering is per-scene batches.
2. **Bulk finish** — "finish the best preview of every shot in this sequence."
3. **Bulk re-prompt by character/outfit** — a design change rippling across hundreds of prompts.
4. **Storage janitor** — auto-prune previews after finishing; archive cold sequences.
5. **RunPod serverless worker** — true scale-to-zero endpoints (pods already idle-off; serverless is the next cost step).

Ask in the chat for any of these — they plug into the same service layer everything above uses.

---

## 10. The one-page cheat sheet

1. **Setup**: Kimi key in Hermes → RunPod key in the wizard → accept H3 terms → move the data folder to a big drive.
2. **Feature film** → story → **Plan everything** → check acts/sequences/cast in the **story explorer**.
3. Per sequence: read the script, sample shots, **Establishing shots**, then **Hunt → Finish** shot by shot (batch per scene; hunt small, finish rarely; one act at a time).
4. **Rough cut** each sequence as it finishes; **Songs** and **Trailer** whenever.
5. **Master cut** → titles/sound/export → done.
6. Costs: ~3 GPU-min per shot; 1,000 shots ≈ $50–110 on 4090-class GPUs; writing is free and resumable; the pod bills by the second and sleeps on its own.
