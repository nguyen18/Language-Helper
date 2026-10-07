import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { objectUrl, type AudioNote } from '../lib/journal'

// An optional spoken note for a journal entry, recorded in the browser (MediaRecorder). The recording
// stays on this device with the entry.

const recordingSupported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * The note's player, drawn in the journal's style (the browser's own controls can't be restyled): a square
 * play/pause button, a thin ink line to drag or tap along, and the time. The length comes from the audio
 * when it says, else from the recording (browser recordings often don't know their own length). `bare`
 * leaves out its "🎙 Audio note" title (a saved entry shows just the bar).
 */
export function AudioNotePlayer({ audio, bare = false }: { audio: AudioNote; bare?: boolean }) {
  const bar = <AudioBar audio={audio} />
  if (bare) return bar
  return (
    <div className="audio-note">
      <span className="muted">🎙 Audio note</span>
      {bar}
    </div>
  )
}

function AudioBar({ audio }: { audio: AudioNote }) {
  const url = objectUrl(audio.blob)
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(audio.seconds)
  const progress = duration ? Math.min(100, (time / duration) * 100) : 0

  return (
    <div className="audio-bar">
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDuration(d)
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setTime(0)
        }}
      />
      <button
        type="button"
        className="icon-button small audio-play"
        aria-label={playing ? 'Pause the audio note' : 'Play the audio note'}
        onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        className="audio-seek"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(time, duration || 0)}
        aria-label="Position in the audio note"
        style={{ '--progress': `${progress}%` } as CSSProperties}
        onChange={(e) => {
          const t = Number(e.target.value)
          if (ref.current) ref.current.currentTime = t
          setTime(t)
        }}
      />
      <span className="audio-time">
        {formatSeconds(time)} / {formatSeconds(duration)}
      </span>
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
