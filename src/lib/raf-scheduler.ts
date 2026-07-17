/**
 * Process-wide rAF coalescer. All callers share a single requestAnimationFrame
 * so panels do not stack their own rAFs (previously one rAF per RawMessages
 * panel per message, which was the largest contributor to the 185 fps
 * FireAnimationFrame count in the trace).
 */
type Task = () => void

const queue: Set<Task> = new Set()
let rafId: number | null = null
const FRAME_BUDGET_MS = 8
const SLOW_FLUSH_MS = 16
const SLOW_TASK_MS = 8
const DIAGNOSTIC_COOLDOWN_MS = 1000
const ENABLE_RAF_DIAGNOSTICS = true
let lastDiagnosticMs = 0

function shouldLogDiagnostic(now: number): boolean {
  if (!ENABLE_RAF_DIAGNOSTICS || now - lastDiagnosticMs < DIAGNOSTIC_COOLDOWN_MS) {
    return false
  }
  lastDiagnosticMs = now
  return true
}

function requestFlush(): void {
  if (rafId != null || typeof requestAnimationFrame === 'undefined') {
    return
  }
  rafId = requestAnimationFrame(flush)
}

function flush() {
  rafId = null
  if (queue.size === 0)
    return
  const debug = ENABLE_RAF_DIAGNOSTICS
  const flushStart = performance.now()
  let executed = 0
  let slowestTaskMs = 0
  const pending = Array.from(queue)
  for (const task of pending) {
    if (!queue.delete(task)) {
      continue
    }
    const taskStart = debug ? performance.now() : 0
    try {
      task()
    }
    catch (err) {
      console.error('rafScheduler task failed', err)
    }
    executed += 1
    if (debug) {
      const taskMs = performance.now() - taskStart
      slowestTaskMs = Math.max(slowestTaskMs, taskMs)
      if (taskMs >= SLOW_TASK_MS && shouldLogDiagnostic(performance.now())) {
        console.debug('rafScheduler slow task', { taskMs })
      }
    }
    if (executed > 0 && queue.size > 0 && performance.now() - flushStart >= FRAME_BUDGET_MS) {
      break
    }
  }
  if (queue.size > 0) {
    requestFlush()
  }
  if (debug) {
    const flushMs = performance.now() - flushStart
    if (flushMs >= SLOW_FLUSH_MS && shouldLogDiagnostic(performance.now())) {
      console.debug('rafScheduler slow flush', {
        flushMs,
        executed,
        remaining: queue.size,
        scheduled: pending.length,
        slowestTaskMs,
      })
    }
  }
}

/**
 * Queue `task` to run on the next animation frame. The same task reference is
 * deduplicated (multiple calls before the next frame collapse to one
 * invocation). Returns a `cancel` function that removes the task if it has not
 * fired yet.
 */
export function scheduleFrame(task: Task): () => void {
  queue.add(task)
  requestFlush()
  return () => {
    queue.delete(task)
  }
}

export function cancelFrame(task: Task): void {
  queue.delete(task)
}
