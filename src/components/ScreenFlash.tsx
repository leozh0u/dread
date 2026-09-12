import { useScareFx } from '../game/scareFx'

export function ScreenFlash() {
  const active = useScareFx((s) => s.flashActive)
  if (!active) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#fff',
        opacity: 0.85,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    />
  )
}
