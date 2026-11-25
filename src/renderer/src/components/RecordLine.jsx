import { useRef, useState } from 'react'

// Record a line from the microphone (the Director Workspace's dialogue recording, first pass): record,
// listen, keep — the take lands as a mono wav (voices:saveRecording) and onDone gets its path. Used by
// Create's voice line and the Director's dialogue track. Multiple takes and waveforms come later.
export default function RecordLine({ onDone, notify, label = '● Record' }) {
  const [recording, setRecording] = useState(false)
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const chunks = useRef([])
  const rec = useRef(null)
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setUrl(URL.createObjectURL(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })))
      }
      r.start()
      rec.current = r
      setUrl(null)
      setRecording(true)
    } catch {
      notify('The microphone isn’t available — check the system’s microphone permission for Techlit Studio.')
    }
  }
  const stop = () => (rec.current?.stop(), setRecording(false))
  async function keep() {
    setBusy(true)
    try {
      const path = await window.ivstudio.voices.saveRecording(await new Blob(chunks.current).arrayBuffer())
      setUrl(null)
      chunks.current = []
      await onDone(path)
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="record-line">
      {!recording && !url && (
        <button className="btn btn-small" onClick={start} title="Record a line from the microphone, in any language">
          {label}
        </button>
      )}
      {recording && (
        <button className="btn btn-small btn-primary" onClick={stop}>
          ■ Stop
        </button>
      )}
      {url && (
        <>
          <audio src={url} controls />
          <button className="btn btn-small btn-primary" disabled={busy} onClick={keep}>
            {busy ? 'Saving…' : 'Use this take'}
          </button>
          <button className="link-btn mono small" onClick={() => (setUrl(null), (chunks.current = []))}>
            Again
          </button>
        </>
      )}
    </span>
  )
}
