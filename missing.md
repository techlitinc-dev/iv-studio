# Missing — a complete tutorial for your first 2-minute film

You will make a 2-minute film in Techlit Studio, step by step:

> **Missing** — On the morning of her 18th birthday, Savitri vanishes from her village.
> The whole village searches. Meera, her best friend — also 18 today — reads the clues
> everyone else walked past, and finds her before the lamps are lit.

By the end you will have: two recurring characters, a real screenplay, a storyboard of
about 15 shots you control one by one, filmed takes you picked yourself, and a finished
rough cut you can export.

Time it takes: about 30–45 minutes of your decisions, plus rendering time
(roughly 15–20 shots × the speed preset you choose — the app shows the estimate).

---

## 0 · Before you start (2 minutes)

Check these once, or every writer/render step will stop with an error:

1. **The writer** (the AI that drafts scripts and shot prompts):
   **Settings → Prompt writer**. Pick one and make sure it answers:
   - **OpenAI-compatible** — e.g. address `https://api.kimi.ai/coding/v1`, model
     `kimi-for-coding`, and your API key in the key field. Click the address's check
     button: it should say the server answers and lists the model.
   - or **Local (Ollama)** — needs Ollama installed with a writer model.
   - or **Claude / ChatGPT / Hermes** — needs that CLI installed and signed in.
2. **ComfyUI** is running (the app starts it for you if it's set up — the title bar
   shows its state), or your **cloud** GPU is set up on the Cloud page.
3. Optional but recommended: **Audio → Voices** if you want the characters to speak
   with fixed voices. Without it, the video model invents a voice per shot.

---

## 1 · Create the two leads (Characters page)

Characters keep the same face and voice in every shot. Make the two girls first:

1. Open **Characters** → **New character**.
2. Character 1:
   - **Name:** `Meera`
   - **About:** `An 18-year-old village girl, sharp-eyed and quiet; notices what
     others miss.`
   - **Look:** `Slim, dark braid, a simple green salwar kameez, barefoot or in worn
     sandals, a thin silver anklet.`
3. Character 2:
   - **Name:** `Savitri`
   - **About:** `Meera's best friend, turning 18 today; gentle, determined, wants to
     sit the city scholarship exam.`
   - **Look:** `Round face, jasmine flowers in her hair, a red-and-gold birthday
     kurta, mehendi on her hands.`
4. Give each a **face picture** (add a photo you have rights to, or let the app draw
   one when you first sketch — a drawn face is kept for every later shot).

Minor roles (Harihar the father, Sub-Inspector Deshmukh) can stay "made-up people":
the film draws them a face of their own on the storyboard. You can promote them to
full characters later.

---

## 2 · Start the film (Projects → New film)

1. Open **Projects** → **+ New film**.
2. The wizard opens on **1 · Idea**:
   - **What's your film about?** paste the logline:

     ```
     On her 18th birthday, Savitri vanishes from her village before the celebrations.
     While the village searches the wrong places, her best friend Meera — also 18
     today — follows the small clues no one else noticed, and finds her at the old
     temple, dressed for the city: Savitri ran to sit the scholarship exam her father
     forbade. Meera must choose: bring her back, or stand with her.
     ```

   - **Where will people watch it?** pick **Widescreen** (16:9).
   - **How long?** click the **2 minutes** pill.
3. **Next: the story ›**

---

## 3 · The script (Story step)

You can click **Write my script** and let the writer draft from the logline — but for
full control, paste this ready-made 2-minute script (it is written for this app:
INT./EXT. headings, action lines, names in capitals with dialogue under them):

```
Title: Missing

EXT. VILLAGE SQUARE - MORNING

Marigold strings and a hand-painted sign: HAPPY BIRTHDAY SAVITRI. Women lay
out sweets. An empty chair with a gift wrapped in newspaper. SAVITRI'S MOTHER
calls toward the lanes, holding a folded kurta.

MOTHER
Savitri! The priest is coming! Savitri?!

INT. SAVITRI'S HOUSE - MORNING

HARIHAR, fifty, turns the house over — cupboards open, a steel trunk ajar.
MEERA, 18, stands at the threshold, still. On the floor: one old rubber
chappal. On the sill: an untouched glass of payasam.

HARIHAR
Her new sandals are gone. Her good bag is gone. Who takes new sandals
and leaves one chappal?

MEERA
Someone who planned it. Someone who didn't want to be followed in the
rain — look, the good umbrella is gone too.

EXT. VILLAGE PATH BY THE WELL - DAY

Villagers drift back from the search, shaking their heads.
SUB-INSPECTOR DESHMUKH, tired, writes in a small book. Meera crouches by
the well: a torn bus-ticket stub, and a length of blue kite string.

DESHMUKH
Half the village walked the fields all day. Nothing.

MEERA
Because she never went to the fields. The 6 a.m. bus to the city. This
is its ticket. And this string — she tied the temple gate open so it
wouldn't creak.

EXT. OLD TEMPLE STEPS - EVENING

Dusk. Oil lamps not yet lit. SAVITRI, 18, jasmine in her hair, a small
bag at her feet, sits on the temple steps reading a form by the last
light: CITY SCHOLARSHIP EXAM — HALL TICKET. Meera stops in front of her.

SAVITRI
If I asked your father, he would say after the exam. After the exams
there was always a wedding being discussed. I only wanted one morning
that was mine.

MEERA
(quiet)
You could have asked me to come with you.

SAVITRI
Would you have?

MEERA
I am here, aren't I?

EXT. VILLAGE SQUARE - NIGHT

The square lit with lamps. Harihar watches as the two girls come up the
lane together — Savitri's bag on Meera's shoulder. A long look. Harihar
exhales, and holds out the wrapped gift to Savitri.

HARIHAR
One morning that is yours. And one that is ours. Cut the cake first,
then we will talk about the city.

Savitri laughs, crying a little. Meera lights the first lamp. The square
fills with light.

THE END
```

**Next: cast and places ›** — the app reads the scenes (5), the spoken lines and the
speakers automatically (you'll see the count under the button).

> 2 minutes ≈ 12–18 shots. This script has 5 scenes of about 20–30 seconds each —
> right in range. If you edit it, keep headings in the `INT./EXT. PLACE - TIME` shape
> and dialogue under a NAME in capitals.

---

## 4 · Cast and places

Here the film's people become *your* characters:

1. **Cast** — for each role the script named, pick who plays it:
   - `Meera` → your **Meera** character
   - `Savitri` → your **Savitri** character
   - `Harihar`, `Mother`, `Deshmukh` → leave uncast: each becomes a made-up person.
     Click **Draw their face now** beside a role if you want to see and keep their
     face before sketching (a drawn face stays the same in every shot).
2. **Outfits** — click **Write outfits from the script**, then edit any line. Outfits
   are repeated into every prompt, so clothes don't change between shots.
3. **Places** — one line per place (Village square, Savitri's house, Village path by
   the well, Old temple steps). Describe each in a sentence, e.g.:

   ```
   Village square: packed-earth square in a Rajasthani village, a banyan tree,
   low houses with blue doors, marigold garlands strung between poles.
   ```

   Or add a photo of a real place — every shot there will match it.

**Next: the storyboard ›**

---

## 5 · The storyboard — where you direct every shot

This is the heart of the app. Click **Plan the shots**. The writer breaks every scene
into shots (each ≤ 10 seconds) and writes each shot's H3 prompt; each panel gets a
**sketch** (a storyboard still) as it's planned.

When it's done, **review every panel like a director**. Click a shot to open its
drawer and you can change:

| Control | What it does |
|---|---|
| **Action** | What happens in the shot — the exact words go into the prompt. |
| **Staging / stage board** | Where each person stands and where the camera is (drag them on the little map; set facing and camera move like *arc left*). |
| **Camera** | Size and movement in words: "slow push-in, close-up". |
| **Seconds** | 3–10 s per shot. |
| **Line & speaker** | Who says what in this shot — the words are put into the prompt exactly. |
| **Continues** | Chain this shot to the previous one as one unbroken take. |
| **Prompt** | The final H3 prompt text — rewrite it by hand, or use the rewrite tools with a note ("colder light", "more fear"). |

Director's passes worth doing on this film:

- **Shot 1 of the film** — make it a wide establishing shot of the square, 8–10 s.
- **The chappal** — find the shot in scene 2 and make it a close-up insert:
  *action:* "Close on the floor by the threshold: one old rubber chappal, still."
- **The clue shots** — the ticket stub and the kite string want close-ups too. The
  audience must *see* the puzzle to enjoy the solve.
- **The choice** — the temple scene lives on faces: set staging so the girls face each
  other, camera close, and give the "I am here, aren't I?" line its own shot.
- **Sketches**: redraw any panel whose framing you don't like (the redraw button on
  the panel). A shot that reads well as a sketch will film well.

> Changed the script instead? Save it on the Story step — scenes whose text changed
> are marked stale and get re-planned; scenes you didn't touch keep their shots.

**Next: film it ›**

---

## 6 · Film it — takes, your pick

Nothing is rendered until you say so. On **5 · Film it**:

1. Choose how many **previews per shot** (2–4 is a good default; more choice, more
   GPU time). Leave **Start each shot from its sketch** on — sketches keep framing.
2. Click **Film every shot** (or film scene by scene with the per-scene button — the
   careful director's way).
3. As takes arrive, each panel shows **Pick a take**: watch the previews, pick the
   one you like. The winner is **finished in full quality** automatically.
4. Don't like any take? **Re-roll that shot** (a new seed) — only that shot, nothing
   else is touched. Edit its action/prompt first if the problem is the words.
5. Characters with voices speak their lines in the finished take.

Watch the **speed preset** (per film, in this step): faster presets mean quicker,
rougher previews — good while hunting takes; the finish is full quality either way.
The app shows the GPU-time estimate before you start.

---

## 7 · Watch — your rough cut

**6 · Watch** assembles the finished shots, in script order, into the rough cut.
Play it end to end. Then:

- A shot that drags: open its drawer → lower its **seconds**, re-finish.
- Fine trims and reordering: open the film in the **Edit** page — a real timeline
  (cut, reorder, per-clip controls), with the film's audio.
- Music: make a score on the **Music** page (describe the cue: *"tense strings,
  village morning, 60 seconds"*) and lay it under the cut in Edit.

Export from the Edit page when you're happy. That's your film.

---

## 8 · When something says no (the errors you'll actually meet)

| Message | What it means | What to do |
|---|---|---|
| *"Ollama is not installed…"* | The writer is set to Local (Ollama) but Ollama isn't there. | Settings → Prompt writer → pick your real writer (e.g. the OpenAI-compatible/Kimi entry) and re-enter its key. |
| *"invalid temperature: only 1 is allowed"* | Old version talking to Kimi. | Fixed in this build — the app retries without a temperature and remembers. Update if you see it. |
| *"This project is already being broken down."* | You clicked Plan/Write while it was still planning in the background. | Wait for the progress line to finish. Clicking again is safe — it's counted as "already being written", not a failure. |
| *"Stopped when Techlit Studio closed. Break it down again…"* | The app closed mid-planning. | Click **Plan the shots** again — finished scenes are kept, only the rest is planned. |
| *"The writer gave no acts / no shots"* or odd output | The writer model had a bad moment. | Try again; if it repeats, switch writer or simplify the scene text. |
| Shots planned but a prompt is empty | The run was interrupted between planning and prompt-writing. | Open the shot's drawer and use the rewrite tool to write that prompt. |

---

## 9 · Ten habits of the person in the director's chair

1. Lock the **script** before planning shots — script changes re-plan scenes.
2. Cast **real characters** for anyone who appears twice.
3. Write **places** in one concrete sentence each; it shows in every shot.
4. Read every **sketch** before filming anything — sketches are free, renders aren't.
5. Give every **clue** its own close-up shot; cutaways carry the mystery.
6. Keep shots **short** (4–7 s); a 2-minute film wants cuts, not long takes.
7. One **line per shot** at most; dialogue-heavy moments get several shots.
8. Pick takes **scene by scene**; don't film all 15 shots and review at midnight.
9. Re-roll with a **prompt edit**, not just a new seed — change the words, change the result.
10. Finish the cut **in Edit**, not in your head: trim the first 10 frames of every
    shot and the film instantly feels more professional.

---

## The short version (cheat sheet)

**Characters** (Meera, Savitri, faces) → **Projects → + New film** → Idea: logline +
16:9 + **2 minutes** → Story: paste the script above → Cast and places: assign
Meera/Savitri, draw faces for the rest, write outfits, describe places → Storyboard:
**Plan the shots**, then edit every panel (action, staging, camera, seconds, lines,
sketch) → Film it: previews per shot, **pick a take** per panel, re-roll the losers →
Watch: rough cut → **Edit** page: trim, music, export.

Now make the village hold its breath.
