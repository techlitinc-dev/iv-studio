# Missing, directed by Hermes — the agent tutorial

The same film as `missing-feature.md` (the 2-hour *Missing*), but this time you drive
the production by **talking to Hermes in the app's chat**. Hermes is your own agent
CLI (from Nous Research) running on your own model and plan; Techlit Studio hands it
the app's tools, and it does the clicking for you — creating the feature, writing
scripts, planning shots, starting renders, checking on them overnight.

Two different ways Hermes can work on your film — don't confuse them:

| Role | Where you set it | What it does |
|---|---|---|
| **Chat agent** (this tutorial) | the chat panel's picker | You talk; Hermes drives the whole app through Techlit Studio's tools. |
| **Prompt writer** | Settings → Prompt writer → Hermes | Every *Write* button in the app (scripts, shot plans, prompts) drafts through the model chosen in Hermes (`hermes model`). |

You can use both at once — a common setup is: Hermes as the chat agent, and your
OpenAI-compatible server (Kimi) as the prompt writer. Or Hermes for both.

---

## 1 · Install and connect Hermes (once)

1. **Install Hermes** from `hermes-agent.nousresearch.com`. Techlit Studio finds it
   by itself afterwards — it looks for `hermes-acp` in `~/.local/bin`,
   `~/.hermes/bin`, or on your PATH (on Windows: `%LOCALAPPDATA%\hermes\bin`).
2. **Give it a model and key.** Hermes writes on the model chosen in Hermes itself:
   ```
   hermes model                      # pick the model
   hermes config set model.api_key <your key>
   ```
   If you use the app's setup wizard, entering your **Kimi key** there sets Hermes's
   `model.api_key` to the same key automatically (the wizard shows
   *"Hermes ✓ (its model key is set)"*).
3. **Check it:** `hermes status` — this is also where you watch your plan's 5-hour
   and weekly limits later; they aren't shared with other apps.
4. **Pick Hermes in the app:** open the chat panel (the chat button, top right) and
   choose **Hermes** in its engine picker. The panel says: *"Your own Hermes, on the
   model you picked in Hermes. Here it uses Techlit Studio's tools only, and asks
   before it deletes, spends money or changes a setting."*

**How the chat is sandboxed** (good to know): Hermes gets Techlit Studio's tool
server for the session and is told to use it. Anything Hermes would normally ask
your approval for on its own — a shell command, a file edit — is **declined
automatically** and shown as a declined step in the chat. Nothing runs that the app
didn't offer it.

---

## 2 · Before the first message

Hermes drives the app, but the app's prerequisites are still yours:

1. **ComfyUI** running (or RunPod set up on the Cloud page) — Hermes can check:
   > *"Run check_setup and tell me what's missing before I make a film."*
2. **A prompt writer** that answers (Settings → Prompt writer) — every script and
   shot prompt Hermes triggers goes through it.
3. **The treatment** from `missing-feature.md` §3 saved somewhere handy — you'll
   paste it into the first big message.

Tip: keep messages **one phase at a time**. Hermes is reliable at "do this phase and
report back"; a single "make me a 2-hour film" message will run out of turn long
before the film does.

---

## 3 · The production, message by message

Copy these prompts in order, replacing the bracketed parts. Each maps to real tools
Hermes has; you can watch everything it does appear in the app's pages live.

### Phase 1 — the cast

> Create four characters for my film. 1) **Meera** — about: "18, sharp-eyed and
> quiet; notices what others miss; shares her birthday with Savitri." look: "Slim,
> dark braid, simple green salwar kameez, thin silver anklet." 2) **Savitri** —
> about: "18 today; gentle, determined; wants to sit the city scholarship exam."
> look: "Round face, jasmine in her hair, red-and-gold birthday kurta, mehendi on
> her hands." 3) **Harihar** — Savitri's father, proud, secretly in debt; white
> dhoti, reading glasses on a string. 4) **Sub-Inspector Deshmukh** — tired,
> methodical thana officer; khaki uniform, small notebook. Then list the characters
> so I can check them.

(Uses `save_character` / `list_characters`. Add face pictures with
`add_character_pictures` — *"give Meera this face picture: /home/me/pics/meera.jpg"* —
or let faces be drawn at sketch time.)

### Phase 2 — the feature

> Create a feature film: name **Missing**, 16:9, **120 minutes**. Logline: "On her
> 18th birthday, Savitri vanishes from her village; her best friend Meera, who
> shares her birthday, reads the clues everyone else walked past and finds her —
> and must choose between the secret and the search." Here is the treatment for the
> story field: [paste the treatment from missing-feature.md §3].

(Uses `create_feature`. Verify with *"get the feature and show me its acts"* →
`get_feature`.)

### Phase 3 — the plan (two ways)

**Let Hermes plan it:**
> Plan the feature from its story: acts, sequences, and the cast. Keep the cast to
> the four characters I already made — reuse them by name.

(`plan_feature` — creates the acts, one Project per sequence, and links the cast.)

**Or dictate the structure yourself** (the 12-sequence table from
`missing-feature.md` §4):
> The feature has 3 acts. Add these sequences to Act I, 10 minutes each, in order:
> "Two Birthdays" — the village wakes for a shared eighteenth birthday…;
> "The Wish" — …; "The Empty Chair" — … . (Then the same for Acts II and III.)

(For each: `create_film` then `attach_sequence` with its act, title, logline and
minutes. Tedious by hand; one message for Hermes.)

### Phase 4 — write one sequence at a time (the control loop)

> Write only the first sequence: its script and shots. (`generate_feature` with
> `sequence`.) Then show me its scenes and shots.

Review in the app (open the sequence in **Projects**), then steer by chat:

> In sequence 1, scene 2: make the chappal shot a close-up insert, 4 seconds, no
> dialogue. (`edit_film_shot`)

> Give scene 3 a coverage plan: wide establishing, Meera medium, the payasam
> insert, the threshold insert. (`set_scene_coverage`, then re-break the scene.)

> Rewrite the prompt of shot 5 with this note: "colder morning light, more dread".
> (`rework_film_shot` / `rework_prompt`)

> Check the sequence for continuity problems. (`check_film_continuity`)

> Export the shot list so I can read it away from the app. (`export_shot_list`)

When the sequence reads right, the next one:
> Write sequence 2 the same way.

### Phase 5 — filming

Rendering is always explicit. Per scene, per shot, or in bulk:

> Render scene 1 of sequence 1: 2 previews per shot, starting from the sketches.
> (`render_film_scene`)

> Show me the takes for shot 3. → pick one: finish candidate 2.
> (`get_job`, `rank_takes`, `finish_film_shot`; `review_take` for a written critique
> of a take)

**The overnight weapon** — for a 1,000-shot film this is how you survive:
> Tonight, queue every planned shot of sequences 1 and 2 as an overnight batch.
> When it's done, make the dailies.

(`start_batch` keeps the PC awake, renders the queue, ranks takes, and leaves a
report in the chat; `make_dailies` cuts one review reel with title cards and a
notes.md. In the morning you watch one reel and pick.)

> Where is the batch? (`get_batch`) · Cancel job X. (`cancel_job`)

### Phase 6 — progress, assembly, sound

> Show me the whole film's progress — what's written, filmed, finished, per act.
> (`explore_feature` — the story tree with per-shot status; the same data as the
> app's Story explorer.)

> Assemble the master cut. (`feature_master_cut` — every sequence's cut in running
> order, opened in Edit; sequences without a cut are reported.)

> Write a song for the film: a village birthday folk song, warm, 90 seconds, that
> can return sadder later. (`make_music`; songs link onto the feature.)

> Make a trailer from the finished footage. (the sizzle tools)

---

## 4 · Prompts that work well with Hermes

1. **One phase per message**, with the ids it needs (*"sequence 2 of feature
   Missing"*) — it can look them up, but naming them saves turns.
2. **Ask for a report back**: "…then list what you created" — you catch drift
   immediately instead of three phases later.
3. **Review gates stay yours**: Hermes writes and renders; *you* watch the dailies,
   pick takes, and approve each sequence before the next. Say so:
   *"Don't start sequence 3 until I say."*
4. **Money asks come to you**: anything paid (a Seedance render on Comfy.org
   credits) makes Hermes fetch the price and wait for your yes — that yes is a
   chat message, so you can always say no.
5. **Destructive things ask too**: deleting projects/characters or changing settings
   prompts you first. Approvals you decline simply don't happen.
6. **When a job is long**, Hermes polls it (`get_job` waits up to 25 s per call) —
   it's fine to keep chatting; ask *"status?"* any time.
7. **If Hermes drifts from the treatment**, don't re-explain in chat — fix the
   feature's Story field (it is re-read for every sequence) and tell Hermes to
   continue.
8. **Show me**: *"show this in the app"* (`show_in_app`) opens the thing it's
   talking about — the fastest way to jump from chat to the panel you want.

---

## 5 · Hermes vs. doing it by hand — the honest split

| Let Hermes do it | Do it yourself (faster/better in the UI) |
|---|---|
| Creating 12 sequences with loglines | Judging scripts — read them in Projects |
| Drafting every sequence's script + shots | Editing shot staging on the stage board (spatial, visual) |
| Re-prompting, coverage plans, continuity checks | Picking takes (watching is the point) |
| Overnight batches, dailies, progress reports | The final cut's feel — trim in Edit yourself |
| Assembly, songs, trailer drafts | Anything you'd have to describe for three paragraphs |

The agent is your production assistant with tireless hands; the taste stays yours.

---

## 6 · Troubleshooting

| Symptom | Do |
|---|---|
| Hermes isn't in the chat picker | It isn't installed where the app looks. Install from hermes-agent.nousresearch.com, or check `which hermes-acp`; restart the app. |
| *"Hermes refused / no key"* | `hermes config set model.api_key <key>` then `hermes status`. The setup wizard's Kimi field also sets it. |
| Steps show as **declined** | That's the sandbox: Hermes tried its own shell/file tool. Tell it to use Techlit Studio's tools only. |
| It hit the plan's limit mid-phase | `hermes status` shows the 5-hour/weekly windows; resume when the window resets — everything in the app is saved and resumable. |
| Scripts/shots come out thin | The writer behind the Write buttons is weak or unset — Settings → Prompt writer (Kimi or Hermes), then re-Write the sequence. |
| It re-planned instead of resuming | `plan_feature` is only for empty features; for more writing say "generate, not re-plan" (`generate_feature` resumes by design). |

One line to remember: **Hermes types, the app remembers, you decide.**
