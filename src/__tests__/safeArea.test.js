import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// safeArea.js calls getComputedStyle(document.documentElement).
// The vitest environment is Node, so we stub both globals manually.

const makeStyleStub = (overrides = {}) => ({
  getPropertyValue: (name) => overrides[name] ?? '0px',
});

describe('getSafeAreaInsets', () => {
  let originalGetComputedStyle;
  let originalDocument;

  beforeEach(() => {
    originalGetComputedStyle = globalThis.getComputedStyle;
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    if (originalGetComputedStyle === undefined) {
      delete globalThis.getComputedStyle;
    } else {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    vi.resetModules();
  });

  it('returns zeros when document is unavailable (SSR/test fallback)', async () => {
    delete globalThis.document;

    const { getSafeAreaInsets } = await import('../core/safeArea.js');
    expect(getSafeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('parses numeric px values from CSS custom properties', async () => {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => makeStyleStub({
      '--sai-top':    '44px',
      '--sai-right':  '47px',
      '--sai-bottom': '34px',
      '--sai-left':   '0px',
    });

    const { getSafeAreaInsets } = await import('../core/safeArea.js');
    const insets = getSafeAreaInsets();

    expect(insets.top).toBe(44);
    expect(insets.right).toBe(47);
    expect(insets.bottom).toBe(34);
    expect(insets.left).toBe(0);
  });

  it('falls back to 0 for missing or empty values', async () => {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => makeStyleStub();

    const { getSafeAreaInsets } = await import('../core/safeArea.js');
    expect(getSafeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
