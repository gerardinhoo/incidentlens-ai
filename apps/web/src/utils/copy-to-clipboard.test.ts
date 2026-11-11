import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './copy-to-clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('writes via navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });

    await expect(copyTextToClipboard('req-42')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('req-42');
  });

  it('falls back to execCommand when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard('req-42')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when clipboard is missing', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard('req-42')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
