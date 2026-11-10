import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INCIDENT_POLL_INTERVAL_MS,
  startVisibilityAwarePolling,
} from './incident-polling';

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

describe('startVisibilityAwarePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
    setDocumentHidden(false);
  });

  it('ticks on the interval while the document is visible', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const onTick = vi.fn();

    const stop = startVisibilityAwarePolling(INCIDENT_POLL_INTERVAL_MS, onTick);

    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS - 1);
    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(2);

    stop();
  });

  it('does not tick while the document is hidden', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const onTick = vi.fn();

    const stop = startVisibilityAwarePolling(INCIDENT_POLL_INTERVAL_MS, onTick);
    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS * 3);
    expect(onTick).not.toHaveBeenCalled();

    stop();
  });

  it('ticks once when the document becomes visible again', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const onTick = vi.fn();

    const stop = startVisibilityAwarePolling(INCIDENT_POLL_INTERVAL_MS, onTick);
    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onTick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(2);

    stop();
  });

  it('does not tick after stop', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const onTick = vi.fn();

    const stop = startVisibilityAwarePolling(INCIDENT_POLL_INTERVAL_MS, onTick);
    stop();
    vi.advanceTimersByTime(INCIDENT_POLL_INTERVAL_MS * 2);
    expect(onTick).not.toHaveBeenCalled();
  });
});
