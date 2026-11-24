// A character's bible on its own page (bible.js): who they are and their look in words, their pictures with roles,
// what each model uses to show them, and the shots they're in. Opened from a card on Characters.
import { useEffect, useState } from 'react'
import { ask } from './Confirm'
import { fileUrl } from './edit/model'
import { LoraPicker, loraTitle } from './Loras'
import { faceOf, readiness, ROLE_SHORT, ROLE_TEXT, ROLES, seedancePictures, wordsFor } from '../../../service/bible'

const TABS = [
  ['look', 'Look'],
  ['pictures', 'Pictures'],
  ['models', 'Models'],
  ['shots', 'Shots']
]
const READY_CLASS = { lora: 'ok', refmod: 'ok', pictures: 'ok', words: 'warn' }

export default function CharacterProfile({ c, face, hasLora, isRef, voices, offer, progress, downloadLabel, install, chooseLora, chooseRefMod, newShot, openShot, remove, onBack, refresh, notify, go, Turnaround, startTab = 'look' }) {
  const [tab, setTab] = useState(startTab)
  const C = window.ivstudio.characters
  const first = c.name.split(/\s+/)[0]
  // text fields keep their own copy while typed and save when they lose focus
  const [draft, setDraft] = useState({})
  useEffect(() => setDraft({}), [c.id])
  const val = (k) => (k in draft ? draft[k] : c[k] ?? '')
  const type = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  async function save(patch) {
    try {
      await C.saveOne({ id: c.id, ...patch })
      await refresh()
    } catch (err) {
      notify(err.message)
    }
  }
  const commit = (k) => () => {
    if (!(k in draft) || draft[k] === (c[k] ?? '')) return
    if (k === 'name' && !String(draft.name).trim()) return setDraft((d) => (({ name, ...rest }) => rest)(d))
    save({ [k]: draft[k] })
  }
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.modal-backdrop') && onBack()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  const ready = readiness(c, { exists: hasLora })
  const words = wordsFor({ ...c, ...draft })

  return (
    <div className="bible">
      <div className="bible-top">
        <button className="link-btn mono" onClick={onBack}>
          ← All characters
        </button>
      </div>
      <header className="bible-head">
        <div className="bible-face">{face ? <img src={fileUrl(face)} alt="" /> : <span className="portrait-initial">{c.name.slice(0, 1)}</span>}</div>
        <div className="bible-head-body">
          <input className="bible-name" value={val('name')} aria-label="Name" onChange={type('name')} onBlur={commit('name')} />
          <input className="bible-about" value={val('about')} placeholder="Who they are, e.g. a jazz singer in her thirties" aria-label="Who they are" onChange={type('about')} onBlur={commit('about')} />
          <div className="bible-ready">
            {Object.entries(ready).map(([k, r]) => (
              <span key={k} className={`bible-chip mono ${READY_CLASS[r.ready]}`} title={r.note || ''}>
                {k === 'h3' ? 'H3' : 'Seedance'} · {r.label}
              </span>
            ))}
          </div>
        </div>
        <div className="bible-head-actions">
          {newShot && (
            <button className="btn btn-primary" onClick={newShot}>
              New shot with {first}
            </button>
          )}
        </div>
      </header>

      <nav className="bible-tabs segmented" role="tablist" aria-label={`${c.name}'s bible`}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {id === 'pictures' && c.pictures.length > 0 && <span className="bible-count mono">{c.pictures.length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'look' && (
        <section className="bible-panel bible-look">
          <label className="bible-field">
            <span className="mono label">Their look, in words</span>
            <textarea rows={4} value={val('look')} placeholder="Face, hair, skin, build, marks. e.g. shoulder-length black hair, a small scar over the left eyebrow, slim build." onChange={type('look')} onBlur={commit('look')} />
            <span className="small dim">Seedance reads this with their pictures, and H3 when they have no LoRA. Write what a stranger would see.</span>
          </label>
          <label className="bible-field">
            <span className="mono label">How they move and talk</span>
            <textarea rows={2} value={val('manner')} placeholder="e.g. quick, restless hands; speaks softly and smiles before she answers." onChange={type('manner')} onBlur={commit('manner')} />
          </label>
          <div className="bible-row">
            <label className="bible-field">
              <span className="mono label">Voice</span>
              <select value={c.voiceId || ''} onChange={(e) => save({ voiceId: e.target.value || null, voiceDeclined: !e.target.value })}>
                <option value="">No voice</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="bible-field">
              <span className="mono label">Their voice, in words</span>
              <input value={val('voiceNote')} placeholder="e.g. soft Bristol West Country voice" onChange={type('voiceNote')} onBlur={commit('voiceNote')} />
            </label>
          </div>
          <div className="bible-preview">
            <span className="mono label">Prompts get</span>
            <p className="small">{words || <span className="dim">Nothing yet: only the name. Add who they are and their look above.</span>}</p>
          </div>
        </section>
      )}

      {tab === 'pictures' && <Pictures c={c} save={save} refresh={refresh} notify={notify} Turnaround={Turnaround} face={face} />}

      {tab === 'models' && <Models c={c} ready={ready} hasLora={hasLora} isRef={isRef} save={save} offer={offer} progress={progress} downloadLabel={downloadLabel} install={install} chooseLora={chooseLora} chooseRefMod={chooseRefMod} notify={notify} go={go} />}

      {tab === 'shots' && <Shots c={c} openShot={openShot} />}

      <footer className="bible-foot">
        <button
          className="link-btn mono danger"
          onClick={async () =>
            (await ask({ title: `Delete “${c.name}”?`, message: `${c.name}'s bible and the pictures copied into Techlit Studio go. LoRA and RefMod files stay in ComfyUI, and shots already made with ${first} keep working.`, confirm: 'Delete', danger: true })) && remove()
          }
        >
          Delete character
        </button>
      </footer>
    </div>
  )
}

function Pictures({ c, save, refresh, notify, Turnaround, face }) {
  const C = window.ivstudio.characters
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  async function add(files, role = null) {
    if (!files?.length) return
    setBusy(true)
    try {
      await C.addPictures({ id: c.id, files, role })
      await refresh()
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  const setRole = (pid, role) => {
    const pictures = c.pictures.map((p) => (p.id === pid ? { ...p, role } : p))
    save({ pictures, picture: faceOf(pictures) })
  }
  async function drop(e) {
    e.preventDefault()
    setOver(false)
    const files = [...(e.dataTransfer?.files || [])].map((f) => window.ivstudio.media.pathFor(f)).filter((f) => /\.(png|jpe?g|webp|bmp)$/i.test(f || ''))
    if (!files.length) return notify('Drop pictures: PNG, JPEG or WebP.')
    add(files)
  }
  const seed = seedancePictures(c).map((p) => p.file)
  return (
    <section className="bible-panel">
      <p className="small dim bible-lede">
        Pictures of {c.name.split(/\s+/)[0]} from several sides, each with its role. Seedance gets the face, three-quarter and full body ones; H3 uses the face picture when there's no LoRA. Only invented people, or real people who agreed to it.
      </p>
      <div className={`bible-pics ${over ? 'over' : ''}`} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
        {c.pictures.map((p) => (
          <figure key={p.id} className={`bible-pic ${p.file === c.picture ? 'is-face' : ''}`}>
            <img src={fileUrl(p.file)} alt={`${c.name}: ${ROLE_TEXT[p.role]}`} />
            <button
              className="bible-pic-x"
              aria-label="Remove this picture"
              onClick={async () => {
                if (!(await ask({ title: 'Remove this picture?', message: `It comes out of ${c.name}'s bible; its copy in Techlit Studio's data folder goes too.`, confirm: 'Remove', danger: true }))) return
                try {
                  await C.removePicture({ id: c.id, pictureId: p.id })
                  await refresh()
                } catch (err) {
                  notify(err.message)
                }
              }}
            >
              ✕
            </button>
            <figcaption>
              <select value={p.role} aria-label="What this picture shows" onChange={(e) => setRole(p.id, e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_SHORT[r]}
                  </option>
                ))}
              </select>
              <span className="bible-pic-tags mono">
                {p.file === c.picture && <span>Face picture</span>}
                {seed.includes(p.file) && <span>Seedance</span>}
              </span>
            </figcaption>
          </figure>
        ))}
        <button className="bible-pic bible-pic-add" disabled={busy} onClick={async () => add(await window.ivstudio.files.pick('picture'))}>
          <span className="portrait-plus">+</span>
          <span>{busy ? 'Adding…' : 'Add pictures'}</span>
          <span className="small dim">or drop them here</span>
        </button>
      </div>
      {Turnaround && <Turnaround c={c} face={face} notify={notify} />}
    </section>
  )
}

function Models({ c, ready, hasLora, isRef, save, offer, progress, downloadLabel, install, chooseLora, chooseRefMod, notify, go }) {
  const [adding, setAdding] = useState(false)
  const extra = c.models?.h3?.loras || []
  const setExtra = (loras) => save({ models: { ...c.models, h3: { ...(c.models?.h3 || {}), loras } } })
  const seed = seedancePictures(c)
  const words = wordsFor(c)
  const hasMain = !!c.lora || !!c.refmod
  return (
    <section className="bible-panel bible-models">
      <article className="bible-model">
        <header>
          <h3>MiniMax H3</h3>
          <span className={`bible-chip mono ${READY_CLASS[ready.h3.ready]}`}>{ready.h3.label}</span>
        </header>
        <p className="small dim">
          {ready.h3.ready === 'lora' && `H3 loads ${c.name.split(/\s+/)[0]}'s LoRA; prompts write {char} where they go.`}
          {ready.h3.ready === 'refmod' && `H3 is shown who ${c.name.split(/\s+/)[0]} is with their RefMod; prompts write {char} where they go.`}
          {ready.h3.ready === 'pictures' && (ready.h3.note || `With no H3 LoRA, H3 gets ${c.name.split(/\s+/)[0]}'s face picture as a reference (the shot renders in References mode).`)}
          {ready.h3.ready === 'words' && (ready.h3.note || 'H3 imagines them from their name.')}
        </p>
        {offer && !hasLora(c.lora) && (
          <button className="btn btn-small btn-primary" disabled={progress != null} onClick={install}>
            {downloadLabel(c.id, offer.lora.size)}
          </button>
        )}
        {hasMain ? (
          <div className="cast-fields">
            {isRef ? (
              <div className="cast-field cast-field-wide">
                <span className="mono label">RefMod</span>
                <div className="lora-field">
                  <input className="mono" value={c.refmod} title={c.refmod} readOnly />
                  <button className="btn btn-small" onClick={chooseRefMod}>
                    Choose
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="cast-field cast-field-wide">
                  <span className="mono label">LoRA {!hasLora(c.lora) && <span className="pink">· not in ComfyUI</span>}</span>
                  <div className="lora-field">
                    <input list="iv-loras" value={c.lora} title={c.lora} onChange={(e) => save({ lora: e.target.value })} />
                    <button className="btn btn-small" onClick={chooseLora}>
                      Choose
                    </button>
                  </div>
                </div>
                <label className="cast-field">
                  <span className="mono label">Trigger word</span>
                  <input className="mono" value={c.trigger} onChange={(e) => save({ trigger: e.target.value })} />
                </label>
              </>
            )}
            <label className="cast-field">
              <span className="mono label">
                Strength <span className="cast-value">{Number(c.strength).toFixed(2)}</span>
              </span>
              <input type="range" min={0} max={1.5} step={0.05} value={c.strength} onChange={(e) => save({ strength: Number(e.target.value) })} />
            </label>
          </div>
        ) : (
          <div className="bible-actions">
            <button className="btn btn-small" onClick={chooseLora}>
              Add an H3 LoRA you have
            </button>
            <button className="btn btn-small" onClick={chooseRefMod}>
              Use a RefMod
            </button>
          </div>
        )}
        {!isRef && hasMain && (
          <div className="bible-extra">
            <span className="mono label">More LoRAs with it</span>
            {extra.length === 0 && <span className="small dim">None. Add a style or outfit LoRA that works well with {c.name.split(/\s+/)[0]}.</span>}
            {extra.map((l, i) => (
              <div key={l.name} className="lora-chip">
                <div className="lora-chip-body">
                  <span className="lora-chip-name" title={l.name}>
                    {loraTitle(l.name)} {!hasLora(l.name) && <span className="pink small">· not in ComfyUI</span>}
                  </span>
                  <div className="lora-chip-strength">
                    <input type="range" min={0} max={1.5} step={0.05} value={l.strength} aria-label={`${loraTitle(l.name)} strength`} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, strength: Number(e.target.value) } : x)))} />
                    <span className="mono small">{Number(l.strength).toFixed(2)}</span>
                  </div>
                </div>
                <button className="lora-chip-x" title="Take it out" onClick={() => setExtra(extra.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn btn-small" onClick={() => setAdding(true)}>
              Add a LoRA
            </button>
          </div>
        )}
      </article>

      <article className="bible-model">
        <header>
          <h3>Seedance 2.5 and 2.5 Flash</h3>
          <span className={`bible-chip mono ${READY_CLASS[ready.seedance.ready]}`}>{ready.seedance.label}</span>
        </header>
        <p className="small dim">{seed.length ? `Seedance gets these ${seed.length > 1 ? `${seed.length} pictures` : 'picture'} as references, each with what it shows, and their look in words.` : `${c.name.split(/\s+/)[0]} has no pictures, so Seedance only reads ${words ? 'their look in words' : 'the name'}. Add pictures for a likeness.`}</p>
        {seed.length > 0 && (
          <div className="bible-seed">
            {seed.map((p, i) => (
              <figure key={p.file}>
                <img src={fileUrl(p.file)} alt="" />
                <figcaption className="mono small">
                  {i + 1} · {ROLE_SHORT[p.role]}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {words && <p className="small bible-words">{words}</p>}
      </article>

      <p className="small dim bible-later">Picture models and LTX don't use characters yet; they read the prompt only.</p>

      {adding && (
        <LoraPicker
          notify={notify}
          go={go}
          onClose={() => setAdding(false)}
          onPick={({ name }) => {
            if (name === c.lora || extra.some((l) => l.name === name)) notify(`${loraTitle(name)} is already on ${c.name}.`, 'info')
            else setExtra([...extra, { name, strength: 0.8 }])
            setAdding(false)
          }}
        />
      )}
    </section>
  )
}

function Shots({ c, openShot }) {
  const [shots, setShots] = useState(null)
  useEffect(() => {
    window.ivstudio.projects.list().then((list) => setShots(list.filter((p) => p.character === c.id)), () => setShots([]))
  }, [c.id])
  if (!shots) return <section className="bible-panel small dim">Looking…</section>
  return (
    <section className="bible-panel">
      {shots.length === 0 && <p className="small dim">No shots with {c.name.split(/\s+/)[0]} as the main character yet.</p>}
      <div className="bible-shots">
        {shots.map((p) => (
          <button key={p.id} className="bible-shot" onClick={() => openShot?.(p.id)}>
            <span className="bible-shot-cover">{p.cover ? /\.(mp4|webm|mov)(\?|$)/i.test(p.cover) ? <video src={p.cover} muted preload="metadata" /> : <img src={p.cover} alt="" /> : null}</span>
            <span className="bible-shot-name">{p.name}</span>
            <span className="mono small dim">
              {p.finals} finished · {p.jobCount} run{p.jobCount === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
