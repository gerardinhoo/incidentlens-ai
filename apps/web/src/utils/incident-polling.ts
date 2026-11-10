/** List and pending-analysis refresh interval (US-033). */
export const INCIDENT_POLL_INTERVAL_MS = 20_000;

/**
 * Call `onTick` on an interval while the document is visible.
 * Pauses when the tab is hidden; ticks once when it becomes visible again.
 */
export function startVisibilityAwarePolling(
  intervalMs: number,
  onTick: () => void,
): () => void {
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stopInterval = () => {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };

  const startInterval = () => {
    stopInterval();
    intervalId = setInterval(() => {
      if (!document.hidden) {
        onTick();
      }
    }, intervalMs);
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      stopInterval();
      return;
    }
    onTick();
    startInterval();
  };

  if (!document.hidden) {
    startInterval();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    stopInterval();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
