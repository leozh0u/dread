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
        /**
         * Moved down from 18%.
         *
         * This line is centred across the full width, while the objective
         * readout is a left-hand column starting at the top. At 18% of a
         * tall window the two landed on top of each other and rendered as
         * one unreadable smear of overlapping text — and this is the
         * Backboard moment, the game telling you it remembers you from
         * last time, so it is precisely the line that must not arrive
         * looking broken.
         *
         * 40% sits below the objective column and well above the vitals
         * panel in the bottom corner, with a max width so a longer
         * sentence wraps in the middle of the screen instead of spreading
         * under either of them.
         */
        top: '40%',
        left: 0,
        right: 0,
        maxWidth: 520,
        margin: '0 auto',
        padding: '0 24px',
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
