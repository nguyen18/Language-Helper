import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal Web Speech API types; not every TS lib.dom ships them.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

const RecognitionImpl: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)

export const dictationSupported = Boolean(RecognitionImpl)

// Streams recognized speech: onFinal gets each finished phrase, interim holds the in-progress text.
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => {
    onFinalRef.current = onFinal
  })

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!RecognitionImpl || recognitionRef.current) return
    const recognition = new RecognitionImpl()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (e) => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) onFinalRef.current(result[0].transcript.trim())
        else pending += result[0].transcript
      }
      setInterim(pending)
    }
    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') setError('Microphone access was blocked.')
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Dictation error: ${e.error}`)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      setInterim('')
    }

    setError(null)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [])

  useEffect(() => stop, [stop])

  return { listening, interim, error, start, stop }
}
