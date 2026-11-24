# Missing — the feature film tutorial (2 hours)

> **Missing** — On the morning of her 18th birthday, Savitri vanishes from her village
> before the celebrations. While the police and the village search the wrong places,
> her best friend Meera — who shares her birthday — reads the small clues everyone
> else walked past, and uncovers not a crime but a decision: Savitri ran to claim the
> one morning that was hers. Finding her is easy. What Meera does next decides
> everything.

This is the long-form version of the tutorial: a **120-minute feature**, built on the
**Features** page, where each sequence is an ordinary Project you direct shot by shot.
If you haven't made a short film in this app yet, do the 2-minute version first
(`missing.md`) — every sequence of this feature is made with exactly that loop.

---

## 0 · Know the scale before you commit (read this first)

A 2-hour film in this app means, in real numbers:

| What | Amount |
|---|---|
| Film length | 120 min = 7,200 seconds |
| Shots (at ~7 s each) | **about 1,030** |
| Sequences | 12 (≈ 10 min each), in 3 acts |
| Scripts | 12 (one per sequence, ~4–8 scenes each) |
| Writer calls (scripts, shot plans, prompts) | roughly 1,500–2,500 |
| GPU time, draft preset | ≈ 50 hours |
| GPU time, balanced preset | ≈ 72 hours |
| GPU time, quality preset | ≈ 107 hours |
| On a rented L40S ($1.09/h) | roughly **$55 / $78 / $117** of GPU time, plus ~$7/month storage |

So treat it like a real production: **weeks of work, sequence by sequence** — not one
weekend. The app is built for exactly this rhythm: everything is resumable, every
sequence is reviewed and filmed on its own, and nothing renders without your say.

**Set a daily cloud budget before you start** (Cloud page → budget). It stops the
meter automatically.

---

## 1 · Setup checklist

1. **Writer**: Settings → Prompt writer → your OpenAI-compatible server
   (`https://api.kimi.ai/coding/v1`, model `kimi-for-coding`, key entered and the
   check passing). At this scale the writer matters more than the GPU — every shot's
   words come from it.
2. **Cloud GPU**: Cloud page → RunPod set up (volume + pod). For 50–100 GPU-hours you
   want the cloud, not your own card. Pick the **L40S** — best value for H3.
3. **Speed preset**: start the production on **draft/balanced** for hunting takes;
   the finish is full quality regardless. (Feature → each sequence inherits it; you
   can change it per sequence in its Film-it step.)
4. **Voices** (Audio → Voices): set voices for Meera, Savitri, Harihar and Deshmukh
   *before* filming dialogue scenes, so every sequence sounds like the same people.

---

## 2 · The cast (Characters page — do this before anything else)

Create these as full characters with face pictures. Across 12 sequences, a character
without a fixed face *will* drift.

| Character | About | Look (use this exact wording everywhere) |
|---|---|---|
| **Meera** | 18, sharp-eyed and quiet; notices what others miss. Shares her birthday with Savitri. | Slim, dark braid, a simple green salwar kameez, thin silver anklet. |
| **Savitri** | 18 today; gentle, determined; wants to sit the city scholarship exam. | Round face, jasmine in her hair, red-and-gold birthday kurta, mehendi on her hands. |
| **Harihar** | Savitri's father, 50s; proud, in debt to the moneylender; loves his daughter the only way he knows. | Grey-stubbled, white dhoti and towel on shoulder, reading glasses on a string. |
| **Lakshmi** | Savitri's mother; the house's quiet engine; secretly kept the exam form. | Cotton saree, hair in a tight bun, brass bangles, tired kind eyes. |
| **Sub-Inspector Deshmukh** | The thana officer; tired, methodical, warmer than he looks. | Khaki uniform, small notebook, moustache, dusty boots. |
| **Rakesh** | The moneylender's son; seen talking to Savitri — the story's red herring. | Early 20s, pressed shirt too formal for the village, motorbike key ring. |
| **Sarpanch** | The village elder; wants nothing to disturb the festival. | White kurta, heavy moustache, brass watch, walking stick. |

Made-up faces drift between sequences; **studio characters don't**. Anyone appearing
in more than one sequence belongs on this list.

---

## 3 · The treatment (paste this into the feature's Story field)

The Story field is what every sequence's script is written from — the writer reads it
every time. Here's a complete treatment:

```
MISSING — a feature in three acts

Meera and Savitri were born on the same morning in the same village, and have
shared every birthday since — two girls of eighteen, one monsoon season of
waiting for their lives to begin. Savitri scored the marks for the city
scholarship exam; her father Harihar, proud and secretly in debt to the
moneylender, has already decided her future: the exam is a waste, a wedding is
being discussed. Meera, who has no such marks and no such plans, believes in
Savitri's escape the way she believes in nothing else.

ACT ONE — THE EMPTY CHAIR. On the morning of their shared eighteenth birthday,
the village square is strung with marigolds for the celebration. Savitri does
not come down. Her room is empty: new sandals gone, good umbrella gone, one old
chappal left at the threshold, the birthday payasam untouched. Harihar raises
the alarm; the Sarpanch, fearful for the festival, keeps the search quiet and
small. Sub-Inspector Deshmukh opens a notebook. Meera stands in the doorway and
understands before anyone: this was planned. While search parties walk the
fields, Meera finds what they walk past — the good umbrella gone means she
feared the rain, not the road; the bus-ticket stub by the well means the 6 a.m.
bus; blue kite string on the temple gate means she left it open so it wouldn't
creak.

ACT TWO — WHAT THE VILLAGE HIDES. The investigation closes in on the wrong
people. Rakesh, the moneylender's son, was seen talking to Savitri — the
village whispers; Deshmukh leans on him; the moneylender leans back on Harihar,
and the debt comes into the open. Lakshmi, the mother, is hiding something of
her own: she kept Savitri's exam form and posted it weeks ago. Midpoint: in
Savitri's schoolbook Meera finds the duplicate hall ticket — Savitri isn't
running away, she is running TO something, the exam hall in the city, two days
away. But the 6 a.m. bus never stopped at the village that morning; the driver
confirms it. So where did she go? A storm breaks over the village — the same
rain Savitri packed the umbrella for — and the search turns desperate: the
river, the well, the fields at night with torches. Meera, re-walking the clues,
realises the kite string means the temple gate was opened FROM INSIDE the
village the night before — Savitri never took the bus at all. She is hiding
until the second day's bus, and only one place in the village is both empty
and hers: the old temple where the girls were born, the one place festival
custom forbids anyone to enter during the celebration.

ACT THREE — THE ONE MORNING. Meera finds Savitri at the old temple, hall
ticket in hand, living on dry sweets, waiting out the festival. The truth
comes out whole: the moneylender's visit, the wedding talk, the exam form her
mother posted, and the plan — sit the exam, win or lose, and come home having
proven the morning was hers. Meera must choose between the secret and the
search party, between Savitri's morning and her own fear. She chooses the
morning: one day of cover, one borrowed bicycle, one friend at the gate. But
Deshmukh, re-reading his own notebook, arrives at the temple a step behind
her — and Harihar behind him. Father and daughter meet under the temple
arch. What he says is not forgiveness and not permission, but something more
honest: one morning that is yours, and one that is ours — cut the cake first,
then we will talk about the city. The festival is celebrated a day late, with
the cake cut by two birthday girls. Epilogue, next year's birthday: a letter
from the city with a scholarship seal, read aloud in the square; Meera ties
the kite string back on the temple gate herself, and leaves it creaking.
```

---

## 4 · Create the feature (Features page)

1. **Features → Start a feature**:
   - **Name:** `Missing`
   - **Logline:** the one-liner at the top of this file.
   - **Aspect:** 16:9. **Target:** `120` minutes.
2. Open the feature and paste the treatment above into **Story — the treatment every
   sequence's script is written from**. Save.
3. Now choose your planning path:

   **Option A — your structure (recommended for control):** add the 12 sequences
   yourself: under each act, type the title, the logline and the minutes into the
   add-sequence row and click **Add**. Type the minutes exactly; the running total
   should be 120.

   **Option B — Plan everything:** let the AI draft acts, sequences and cast from
   the treatment, then edit the result toward this table. Re-planning replaces the
   plan (existing sequences stay in Projects).

### The 12 sequences

| # | Act | Sequence | Min | Logline (paste into its field) |
|---|---|---|---|---|
| 1 | I | Two Birthdays | 10 | The village wakes for a shared eighteenth birthday; Meera and Savitri's friendship, the exam dream, and Harihar's silence about the moneylender's visit. |
| 2 | I | The Wish | 10 | Celebration preparations; Savitri asks her father for one morning and is refused; the girls' midnight ritual at the temple gate; Lakshmi secretly posts the exam form. |
| 3 | I | The Empty Chair | 10 | Birthday morning: Savitri is gone — one chappal at the threshold, untouched payasam; the alarm, the quieted search, Meera reads the room. |
| 4 | II | The Search | 10 | Search parties walk the fields; Deshmukh's notebook; Meera finds the ticket stub and the kite string; the Sarpanch keeps it all quiet. |
| 5 | II | The Moneylender's Son | 10 | The village turns on Rakesh; the debt surfaces; Harihar's pride breaks in public; Meera notices what the gossip is hiding. |
| 6 | II | What Mothers Keep | 10 | Lakshmi's secret: the posted exam form; mother and father confront what they each kept from the other; Meera begins to understand the plan. |
| 7 | II | Paper Boats | 10 | Midpoint: the duplicate hall ticket in Savitri's schoolbook — she ran TO the exam; but the 6 a.m. bus never stopped. The puzzle turns. |
| 8 | II | The Storm | 10 | The rain Savitri packed for; torches by the river at night; the search despairs; Meera re-walks every clue in the rain. |
| 9 | II | The Gate That Creaks | 10 | The kite string means the temple gate was opened from inside — Savitri never left the village; festival custom keeps everyone away from the old temple. Meera goes alone. |
| 10 | III | The Temple Gate | 10 | Meera finds Savitri living on dry sweets, hall ticket in hand; the whole truth; the choice — one day of cover, one borrowed bicycle. |
| 11 | III | One Morning That Is Mine | 10 | Deshmukh re-reads his notebook and arrives a step behind; Harihar under the temple arch; father and daughter; the honest bargain. |
| 12 | III | Lamps | 10 | The festival celebrated a day late; the cake cut by two birthday girls; epilogue — next year, the scholarship letter, and the gate left creaking. |

4. **Cast**: after planning, the feature's cast is linked to your studio characters
   (step 2). Check each sequence inherited them — that's what puts their names into
   the shot planner and their faces into the shots.

---

## 5 · The production loop — one sequence at a time

This is where "100% control" lives. **Do not** press *Write scripts & shots* for the
whole feature on day one. Work like a series:

**For each sequence, in order:**

1. On the feature page, click **Write** on that one sequence. The writer drafts its
   script from its logline + the treatment + the cast. (Scripts already written are
   kept; a partly-planned sequence resumes where it stopped.)
2. Open the sequence **in Projects** and run the full wizard on it — exactly the
   loop from `missing.md`:
   - **Story**: read the drafted script and *edit it hard*. This is a 10-minute
     episode; it should have 5–9 scenes. Fix continuity against the treatment
     (what Meera knows now, what the village believes now).
   - **Cast and places**: assign characters; **paste the same place descriptions
     every time** (keep them in a notes file — the square, the house, the temple
     gate, the well, the river bank; see §6). Consistency across 12 sequences is
     manual: same words, same look.
   - **Storyboard**: Plan the shots, then direct every panel — action, staging on
     the stage board, camera, seconds, the one line per shot, sketches. At 10
     minutes this is ~85 shots per sequence. Budget an evening per sequence for
     this pass; it is the job.
   - **Film it**: previews → pick a take per shot → re-roll losers (edit the
     prompt, then re-roll). Finish only picks.
   - **Watch**: the sequence's rough cut; trim in Edit.
3. Only when a sequence's cut plays well, move to the next. The feature page tracks
   progress per act (shots planned / filmed / finished, minutes in the can), and
   **Story explorer** shows the whole film as a map coloured by what's written,
   filmed and finished — use it as your production wall.

**Review gates** (do these or the film drifts):
- After sequence 1: check Meera and Savitri look right in motion. Fixing a
  character after 3 sequences costs 3 sequences of re-renders.
- After sequence 3 (end of Act I): watch 1–3 back to back. Pacing wrong here means
  the treatment needs editing, not the shots.
- After sequence 7 (midpoint): the puzzle must re-hook. If it doesn't, rewrite
  sequence 8–9 scripts before filming them.

---

## 6 · The consistency kit (copy-paste these, verbatim, everywhere)

Drift is the enemy of a 2-hour AI film. Keep one notes file with these blocks and
paste them without rewording:

**Places** (Cast and places step, every sequence that uses them):

```
Village square: packed-earth square in a Rajasthani village, a huge banyan tree,
low houses with blue doors, marigold garlands strung between wooden poles.
Savitri's house: two-room village house, lime-washed walls, a steel trunk, a
charpai in the courtyard, birthday decorations half-hung.
Old temple: small sandstone temple on a low hill, worn steps, a heavy wooden
gate with a blue kite string tied to its latch, oil-lamp niches.
The well: stone-ringed well at the path fork, brass lotas on the rim, wet
footprints, fields beyond.
River bank: wide sandy bank, tame river in flood season, tamarisk bushes,
torchlight at night.
```

**Look of the film** (each sequence's look notes):

```
Natural light, warm dust, monsoon greens; handheld intimacy in the search,
still and wide for the temple; lamps and torchlight at night.
```

**Characters**: never retype their looks — they come from the Characters page now.
That's the point of step 2.

---

## 7 · Money, time and the cloud

- **Budget**: Cloud page → set a daily budget. The meter enforces it and stops GPU
  spend at the cap. The title bar shows today's spend as you work.
- **Storage**: the RunPod volume (~100 GB) bills monthly until deleted — a few
  dollars; delete it only when the whole film is done.
- **Rhythm that works**: plan and edit at your desk with the pod off (writing needs
  no GPU), then wake the pod and film a batch of takes. The pod shuts itself off
  when idle — you pay for render time, not review time.
- **Re-rolls are the budget-killer**: always edit the prompt before re-rolling a
  take. Same words, new seed, same disappointment.

---

## 8 · Assemble, score, trailer

1. **Master cut** (feature page): joins every sequence's cut, in running order,
   into one Edit. Sequences without a cut are listed, so you know what's missing.
   Open it, watch the seams between sequences — that's where features fall apart;
   trim there first.
2. **Songs** (**Write a song**): the Music page writes the feature's songs and
   score. For this film: a birthday folk song for Act I (it returns, broken, in
   Act II's storm), a tense search cue, and a lamps-and-laughter reprise for the
   end. Lay them under the master cut in Edit.
3. **Trailer**: the feature's Trailer box cuts a promo from your footage — do it
   after Act III is filmed, when the best shots exist.
4. Final pass in **Edit**: titles, the festival sound bed, trim 10 frames off the
   head of every scene change. Export.

---

## 9 · When something breaks at scale

| Symptom | Meaning | Do |
|---|---|---|
| *"…already being written"* in the notification | You clicked Write while a sequence was still planning. | Nothing — it's counted, not failed. Wait. |
| *"Stopped when Techlit Studio closed…"* on a sequence | The app closed mid-planning. | Click that sequence's **Write** again — finished scenes are kept, the rest resumes. |
| *"Ollama is not installed…"* | The writer got switched to Local (Ollama). | Settings → Prompt writer → back to your OpenAI-compatible server; re-enter its key if empty. |
| A sequence's characters look wrong in prompts | Its cast wasn't linked (planned before characters existed). | Click **Write scripts & shots** once — it heals the cast links without redoing finished work — or re-Write that sequence. |
| Writer output drifts from the treatment | The treatment is being read fresh each time; vague lines drift. | Make the sequence logline more specific; paste the relevant treatment paragraph into the script yourself and edit from there. |
| GPU bill climbing | Re-rolls without prompt edits, or too many previews. | 2 previews max while hunting; edit prompts before re-rolls; check the daily budget cap. |

---

## 10 · Cheat sheet

Characters (7, with faces) → Cloud set up + daily budget → **Start a feature**
(120 min, 16:9) → paste the **treatment** into Story → add **3 acts / 12 sequences**
from the table → for each sequence: **Write** → open in Projects → edit script →
cast & places (same words every time) → plan shots → direct every panel → film in
batches, pick takes → rough cut → next sequence → **Master cut** → songs, trailer,
Edit, export.

One sequence at a time. The film is twelve short films that agree with each other.
