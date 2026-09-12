/**
 * Backboard — "the house remembers you between sessions."
 *
 * The Director already runs an epsilon-greedy bandit over four scare
 * types, learning which one produces the biggest pulse spike in THIS
 * player (director.ts). Within one session that's a nice touch. Persisted,
 * it becomes the actual premise: close the tab, come back tomorrow, and
 * the house opens with whatever worked on you last time instead of
 * starting from scratch.
 *
 * So what gets stored is the bandit's arm statistics, not a log of events.
 * That's the thing with predictive power, and it's small enough to be one
 * memory per run.
 *
 * PROXIED, NOT DIRECT. Backboard has no publishable key concept — their
 * docs are explicit that keys are server-side only — so every call goes
 * through the sidecar. DREAD is a static site, so a key in the bundle
 * would be a key given away. The cost is that memory works on Leo's
 * machine and in the video, but not on the hosted build for judges. That
 * is a constraint of their API, not a design choice, and it's stated
 * plainly rather than hidden.
 *
 * Every function here fails silently by design: no sidecar, no network, no
 * key — the game plays exactly as it does today, just without a past.
 */
import type { ScareType } from '../game/director'

const SIDECAR = 'http://localhost:8787'
const TIMEOUT_MS = 4000

export interface ScarePriors {
  stats: Record<ScareType, { attempts: number; totalDelta: number }>
  runs: number
}

/** Stable identity for one player across sessions on this machine. */
function playerId(): string {
  try {
    const existing = localStorage.getItem('dread.playerId')
    if (existing) return existing
    const id = `p_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('dread.playerId', id)
    return id
  } catch {
    // Private browsing, or storage disabled. A per-session identity still
    // lets a single sitting work; it just won't outlive the tab.
    return 'p_anon'
  }
}

/**
 * Write this run's learned statistics back to the house.
 *
 * Stored as prose with a JSON tail. Backboard's retrieval is semantic, so
 * the sentence is what makes it findable; the JSON is what makes it
 * usable. Storing bare JSON would search badly, and storing bare prose
 * would need parsing back out of English.
 */
export async function rememberRun(args: {
  stats: Record<ScareType, { attempts: number; totalDelta: number }>
  outcome: string
  peakBpm: number | null
  baseline: number | null
}): Promise<boolean> {
  const worst = bestArm(args.stats)
  const id = playerId()
  const content =
    `Player ${id} finished a run of DREAD: ${args.outcome}. ` +
    `Resting pulse ${args.baseline ?? 'unknown'}, peak ${args.peakBpm ?? 'unknown'}. ` +
    (worst
      ? `They react most strongly to ${worst} scares.`
      : `No scare type produced a clear reaction.`) +
    `\n<priors>${JSON.stringify({ stats: args.stats, runs: 1 })}</priors>`

  try {
    const res = await fetch(`${SIDECAR}/memory/remember`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, metadata: { playerId: id, outcome: args.outcome } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

/**
 * Ask the house what it already knows about this player.
 *
 * Sums the priors across every remembered run so a player who has been
 * scared the same way three times carries three runs of evidence, not one.
 */
export async function recallPriors(): Promise<ScarePriors | null> {
  const id = playerId()
  try {
    const res = await fetch(
      `${SIDECAR}/memory/recall?q=${encodeURIComponent(`what frightens player ${id}`)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { ok?: boolean; memories?: { content?: string }[] }
    if (!body.ok || !body.memories?.length) return null

    const merged: ScarePriors = {
      stats: {
        proximity: { attempts: 0, totalDelta: 0 },
        audio: { attempts: 0, totalDelta: 0 },
        visual: { attempts: 0, totalDelta: 0 },
        absence: { attempts: 0, totalDelta: 0 },
      },
      runs: 0,
    }

    for (const m of body.memories) {
      const match = m.content?.match(/<priors>([\s\S]*?)<\/priors>/)
      if (!match) continue
      try {
        const parsed = JSON.parse(match[1]) as ScarePriors
        for (const k of Object.keys(merged.stats) as ScareType[]) {
          const s = parsed.stats?.[k]
          // Guard every field: this is parsed from text returned by a
          // remote service, so it is data, not something to trust.
          if (!s || !Number.isFinite(s.attempts) || !Number.isFinite(s.totalDelta)) continue
          merged.stats[k].attempts += s.attempts
          merged.stats[k].totalDelta += s.totalDelta
        }
        merged.runs += Number.isFinite(parsed.runs) ? parsed.runs : 1
      } catch {
        /* one unparseable memory shouldn't discard the rest */
      }
    }
    return merged.runs > 0 ? merged : null
  } catch {
    return null
  }
}

/** Which scare type has the highest average pulse spike, if any. */
export function bestArm(
  stats: Record<ScareType, { attempts: number; totalDelta: number }>,
): ScareType | null {
  let best: ScareType | null = null
  let bestAvg = 0
  for (const k of Object.keys(stats) as ScareType[]) {
    const s = stats[k]
    if (s.attempts === 0) continue
    const avg = s.totalDelta / s.attempts
    if (avg > bestAvg) {
      bestAvg = avg
      best = k
    }
  }
  return best
}
