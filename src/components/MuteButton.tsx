import { useEffect, useState } from 'react'
import { setMuted } from '../game/scareFx'

/**
 * Mute, in the corner, always available.
 *
 * Kept deliberately quiet visually — low opacity until hovered — because
 * this is a horror game and a bright UI chip in the corner costs
 * atmosphere. But it's always there, because "I can't turn the sound
 * off" is the kind of thing that makes someone close the tab, and a
 * judge in a loud room may well need it.
 *
 * Bound to N as well as the button: pointer lock captures the mouse
 * during play, so a click target alone isn't reachable without first
 * breaking out of the game.
 */
export function MuteButton() {
  const [off, setOff] = useState(false)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    setMuted(off)
  }, [off])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyN' && !e.repeat) setOff((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <button
      onClick={() => setOff((v) => !v)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Mute (N)"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 30,
        background: 'transparent',
        border: `1px solid rgba(204,51,51,${off || hover ? 0.75 : 0.3})`,
        color: '#c33',
        opacity: off || hover ? 0.95 : 0.4,
        padding: '6px 12px',
        fontFamily: 'monospace',
        fontSize: 11,
        letterSpacing: 2,
        cursor: 'pointer',
        transition: 'opacity 200ms linear, border-color 200ms linear',
      }}
    >
      {off ? 'MUTED · N' : 'SOUND · N'}
    </button>
  )
}
