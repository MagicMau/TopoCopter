/**
 * Read iOS/browser safe-area insets from CSS environment variables.
 *
 * `index.html` maps the browser's `env(safe-area-inset-*)` values onto
 * `--sai-*` CSS custom properties on `:root` so they are readable via
 * `getComputedStyle`.  On devices without a notch/Dynamic-Island all four
 * values are 0.
 *
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function getSafeAreaInsets() {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = getComputedStyle(document.documentElement);
  const parse = (varName) =>
    Math.round(parseFloat(style.getPropertyValue(varName)) || 0);

  return {
    top:    parse('--sai-top'),
    right:  parse('--sai-right'),
    bottom: parse('--sai-bottom'),
    left:   parse('--sai-left'),
  };
}
