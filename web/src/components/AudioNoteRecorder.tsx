import { useEffect, useRef, useState } from 'react'
import { objectUrl, type AudioNote } from '../lib/journal'

// An optional spoken note for a journal entry, recorded in the browser (MediaRecorder). The recording
// stays on this device with the entry.

const recordingSupported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The note's player; `bare` leaves out its "🎙 Audio note · 0:03" title (a saved entry shows just the bar). */
export function AudioNotePlayer({ audio, bare = false }: { audio: AudioNote; bare?: boolean }) {
  const url = objectUrl(audio.blob)
  if (bare) return <audio className="audio-bar" controls src={url} preload="metadata" aria-label="Audio note" />
  return (
    <div className="audio-note">
      <span className="muted">🎙 Audio note · {formatSeconds(audio.seconds)}</span>
      <audio controls src={url} preload="metadata" />
    </div>
  )
}

type Props = { audio?: AudioNote; onChange: (audio: AudioNote | undefined) => void }

export function AudioNoteRecorder({ audio, onChange }: Props) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  // Stop the microphone if the editor closes mid-recording.
  useEffect(() => () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop()), [])

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds((Date.now() - started) / 1000), 250)
    return () => window.clearInterval(timer)
  }, [recording])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      const started = Date.now()
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        recorderRef.current = null
        setRecording(false)
        if (chunks.length) {
          onChange({ blob: new Blob(chunks, { type: recorder.mimeType }), seconds: (Date.now() - started) / 1000 })
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      setRecording(true)
    } catch {
      setError("Couldn't use the microphone. Check that this site is allowed to use it.")
    }
  }

  if (!recordingSupported) {
    return <p className="muted">This browser can't record audio notes.</p>
  }

  return (
    <div className="audio-recorder">
      {audio && !recording ? (
        <div className="audio-recorder-row">
          <AudioNotePlayer audio={audio} />
          <button type="button" className="chip" onClick={() => onChange(undefined)}>
            Remove
          </button>
          <button type="button" className="chip" onClick={start}>
            Record again
          </button>
        </div>
      ) : recording ? (
        <button type="button" className="mic listening" onClick={() => recorderRef.current?.stop()}>
          ■ Stop recording · {formatSeconds(seconds)}
        </button>
      ) : (
        <button type="button" className="mic" onClick={start}>
          🎙 Record an audio note
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
