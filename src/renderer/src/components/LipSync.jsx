import { useEffect, useRef, useState } from 'react'
import { FlowHero, Step, Choices, WorkflowNeeds } from './FlowKit'
import { fileUrl } from './edit/model'
import { src } from './filmkit'

// Lip-sync (Workflows): a video re-mouthed to new words on MiniMax H3's retake (src/service/studio.js
// lipsyncFile). The video and the audio are picked here; the words can be said in a character's voice on the
// spot. H3's window is 15 s, so a longer video re-mouths the stretch picked in step 3. Renders through
// ComfyUI like everything else: this PC, or the person's own cloud (RunPod, Modal).
const L = () => window.ivstudio.lipsync
const V = () => window.ivstudio.voices
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const base = (p) => String(p || '').split(/[\\/]/).pop()

export default function LipSync({ go, notify, characters, jobs }) {
  const [video, setVideo] = useState(null) // the picked video's path
  const [dur, setDur] = useState(0)
  const [way, setWay] = useState('say') // the words: said in a voice, or a sound file
  const [voiceId, setVoiceId] = useState('')
  const [words, setWords] = useState('')
  const [said, setSaid] = useState(null) // { file, duration } from the voice engine
  const [saying, setSaying] = useState(false)
  const [sound, setSound] = useState(null) // the picked sound file's path
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(15)
  const [character, setCharacter] = useState('none')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState(null)
  const player = useRef(null)
  const job = jobId ? jobs[jobId] : null
  const voiced = characters.filter((c) => c.voiceId)
  const audio = way === 'say' ? said?.file : sound

  // the window follows the video: the whole clip when it fits H3's 15 s, else the first 15
  const onMeta = () => {
    const d = player.current?.duration || 0
    if (!Number.isFinite(d) || !d) return
    setDur(d)
    setStart(0)
    setEnd(Math.min(15, Math.ceil(d)))
  }
  useEffect(() => {
    if (character !== 'none') {
      const ch = characters.find((c) => c.id === character)
      if (ch?.voiceId) setVoiceId(ch.voiceId)
    }
  }, [character])

  const pickVideo = async () => {
    const f = await window.ivstudio.files.pick('video')
    if (!f) return
    setVideo(Array.isArray(f) ? f[0] : f)
    setDur(0)
    setJobId(null)
  }
  const pickSound = async () => {
    const f = await window.ivstudio.files.pick('audio')
    if (!f) return
    setSound(Array.isArray(f) ? f[0] : f)
  }
  const speak = async () => {
    if (!words.trim()) return notify('Type the words first.')
    if (!voiceId) return notify('Pick a voice. Characters get one on Audio → Voices.')
    setSaying(true)
    try {
      const line = await V().speak({ voiceId, text: words.trim() })
      setSaid(line)
      if (dur) setEnd(Math.min(15, Math.max(1, Math.ceil(Math.min(line.duration || 15, dur - start)))))
    } catch (err) {
      notify(err.message)
    }
    setSaying(false)
  }
  const render = async () => {
    if (!video) return notify('Pick the video to re-mouth first.')
    if (!audio) return notify(way === 'say' ? 'Say the words first (or pick a sound file).' : 'Pick the audio to lip-sync to.')
    if (!(Number(end) > Number(start))) return notify('The stretch must end after it starts.')
    setBusy(true)
    try {
      const j = await L().render({ name: base(video).replace(/\.[a-z0-9]+$/i, ''), sourcePath: video, audio, start: +start, end: +end, prompt, character })
      setJobId(j.id)
      notify(`Lip-syncing ${clock(+start)}–${clock(+end)}. The rest of the video is kept.`, 'info')
    } catch (err) {
      notify(err.message)
    }
    setBusy(false)
  }
  const outs = (job?.outputs || []).filter((o) => o.url || o.path)

  return (
    <div className="lipsync">
      <FlowHero go={go} art="workflows" title="Lip-sync" kicker="Re-mouth a video to new words">
        <WorkflowNeeds page="lipsync" />
      </FlowHero>
      <p className="lede">
        Pick a video and the words. MiniMax H3 redoes the picture so the lips move with the new audio.
        <span className="lede-small dim">Everything outside the stretch stays exactly as it was. Runs on this PC's ComfyUI or your own cloud (RunPod, Modal).</span>
      </p>

      <Step n={1} title="The video" sub="Any clip with a person speaking, up to 15 s re-mouthed at a time.">
        <div className="lipsync-pick">
          <button className="btn" onClick={pickVideo}>
            {video ? 'Change the video' : 'Pick a video'}
          </button>
          {video && (
            <span className="mono small dim">
              {base(video)}
              {dur ? ` · ${clock(dur)}` : ''}
            </span>
          )}
        </div>
        {video && <video ref={player} className="lipsync-video" src={fileUrl(video)} controls onLoadedMetadata={onMeta} />}
        {dur > 15 && <p className="small dim">The clip is {clock(dur)}. H3 re-mouths up to 15 s at a time, so pick the speaking stretch in step 3.</p>}
      </Step>

      <Step n={2} title="The words" sub="Said in a character's voice, or any sound file.">
        <Choices
          label="Where the audio comes from"
          value={way}
          onChange={setWay}
          options={[
            ['say', 'Say it here', 'A character’s voice speaks the words you type.'],
            ['file', 'A sound file', 'A recording, a song snippet, any audio.']
          ]}
        />
        {way === 'say' ? (
          <div className="lipsync-say">
            <label className="small dim">
              Voice{' '}
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} aria-label="Voice">
                <option value="">Pick a voice…</option>
                {voiced.map((c) => (
                  <option key={c.id} value={c.voiceId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!voiced.length && <p className="small dim">No character has a voice yet. Make one on Audio → Voices, or use a sound file.</p>}
            <textarea className="wiz-big" rows={2} value={words} placeholder="The new words, exactly as they should be said." onChange={(e) => setWords(e.target.value)} />
            <div className="lipsync-pick">
              <button className="btn btn-small" disabled={saying || !words.trim() || !voiceId} onClick={speak}>
                {saying ? 'Saying it…' : said ? 'Say it again' : 'Say it'}
              </button>
              {said && <audio src={fileUrl(said.file)} controls />}
            </div>
          </div>
        ) : (
          <div className="lipsync-pick">
            <button className="btn btn-small" onClick={pickSound}>
              {sound ? 'Change the sound' : 'Pick a sound file'}
            </button>
            {sound && (
              <>
                <span className="mono small dim">{base(sound)}</span>
                <audio src={fileUrl(sound)} controls />
              </>
            )}
          </div>
        )}
      </Step>

      <Step n={3} title="The stretch" sub={dur > 15 ? 'Which seconds get re-mouthed. Up to 15 s.' : 'The whole clip, or just the speaking part.'}>
        <div className="lipsync-window">
          <label className="mono small dim">
            from{' '}
            <input type="number" min={0} max={Math.max(0, Math.floor(dur))} step={0.5} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start second" /> s
          </label>
          <label className="mono small dim">
            to{' '}
            <input type="number" min={0} max={Math.ceil(dur) || 15} step={0.5} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End second" /> s
          </label>
          <span className="mono small dim">{Number(end) > Number(start) ? `${(Number(end) - Number(start)).toFixed(1)} s re-mouthed` : ''}</span>
        </div>
      </Step>

      <Step n={4} title="Who and how" sub="Optional. A character keeps their face steadier; the prompt steers the acting.">
        <div className="lipsync-who">
          <label className="small dim">
            Character{' '}
            <select value={character} onChange={(e) => setCharacter(e.target.value)} aria-label="Character">
              <option value="none">Whoever is in the video</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <textarea className="wiz-big" rows={2} value={prompt} placeholder="The person speaks, their lips moving naturally with the words." onChange={(e) => setPrompt(e.target.value)} />
        </div>
      </Step>

      <div className="lipsync-go">
        <button className="btn btn-primary" disabled={busy || !video || !audio || !(Number(end) > Number(start))} onClick={render}>
          {busy ? 'Sending…' : 'Re-mouth it'}
        </button>
        {job && <span className={`mono small ${job.status === 'error' ? 'pink' : 'dim'}`}>{job.status === 'success' ? 'Done.' : job.status === 'error' ? `Failed: ${job.error || 'see the log'}` : `${job.status}…`}</span>}
      </div>
      {outs.length > 0 && (
        <div className="lipsync-out">
          {outs.map((o, i) => (
            <video key={`${o.path || o.url}${i}`} src={src(o)} controls autoPlay={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}
