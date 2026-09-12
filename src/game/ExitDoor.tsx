import { useThreat, CLUES_REQUIRED } from './threat'

/** Just the visual/light indicator now — the actual blocking geometry
 * lives inside House's shared RigidBody (see House.tsx and the note
 * there on why a standalone conditionally-mounted RigidBody wasn't used).
 */
export function ExitDoorLight({ position }: { position: [number, number, number] }) {
  const collected = useThreat((s) => s.cluesCollected.size)
  const unlocked = collected >= CLUES_REQUIRED
  return (
    <pointLight
      position={position}
      color={unlocked ? '#22cc44' : '#cc2222'}
      intensity={60}
      distance={4}
    />
  )
}
