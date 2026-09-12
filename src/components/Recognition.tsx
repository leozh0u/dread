import { useEffect, useState } from 'react'

/**
 * "The house has met you 3 times. It remembers the audio."
 *
 * Shown once, early, then it fades. This is the only place the player is
 * told that anything persisted between sessions, so it has to land — but
 * it's also a line of UI text in a horror game, so it cannot sit there
 * permanently competing with the dark.
 */
export function Recognition({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // A beat before it appears — arriving instantly reads as a page
    // element, arriving a moment late reads as being noticed.
    const show = setTimeout(() => setVisible(true), 900)
    const hide = setTimeout(() => setVisible(false), 9000)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: '18%',
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#c33',
        fontFamily: 'monospace',
        fontSize: 13,
        letterSpacing: 2,
        opacity: visible ? 0.85 : 0,
        transition: 'opacity 1400ms linear',
        pointerEvents: 'none',
        zIndex: 25,
        textShadow: '0 0 12px rgba(0,0,0,0.9)',
      }}
    >
      {text}
    </div>
  )
}
