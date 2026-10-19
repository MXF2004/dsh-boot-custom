/**
 * Pure boot-timing arithmetic.
 *
 * The hard timeout is measured from the first-frame paint, so time already
 * spent on the mask reduces the remaining budget instead of resetting it.
 */

import { LIMITS } from '../../shared/types.js'

/** Remaining hard-timeout budget for a run that started `elapsedMs` ago. */
export function remainingHardTimeoutMs(elapsedMs: number): number {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return Math.max(0, LIMITS.hardTimeoutMs - elapsed)
}
