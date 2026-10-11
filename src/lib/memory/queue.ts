/**
 * Serial queue for background memory work (extraction, profile refresh), so
 * tasks never race on the same memories and one failure never blocks the next.
 */

let queue: Promise<void> = Promise.resolve();

export function enqueueMemoryTask(label: string, task: () => Promise<void>): void {
  queue = queue
    .then(task)
    .catch((error) => {
      if (__DEV__) console.warn(`[memory] ${label} failed:`, error);
    });
}
