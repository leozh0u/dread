/**
 * A stable identity for one player across sessions on this machine.
 *
 * Shared by Backboard (what frightens you) and Tiger Data (your past
 * runs), because those two must agree on who "you" are — otherwise the
 * house remembers a player whose pulse history belongs to someone else.
 * It was originally private to houseMemory.ts, which would have silently
 * produced exactly that split.
 *
 * Deliberately a random local token, not anything identifying: it never
 * leaves this machine except to the local sidecar, and it means nothing
 * to anyone who finds it.
 */
export function playerId(): string {
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
