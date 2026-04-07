/**
 * DOM-based typing overlay for the spelling question mode.
 *
 * Renders a native <input> element so mobile devices show their on-screen
 * keyboard.  The overlay is appended to a host element (typically #game-root)
 * and uses absolute positioning to sit on top of the Phaser canvas.
 *
 * The overlay is self-contained: it manages its own DOM nodes and event
 * listeners, and removes them cleanly on hide/destroy.
 *
 * Usage:
 *   const overlay = new TypingOverlay(document.getElementById('game-root'));
 *
 *   overlay.show({
 *     prompt:     'Typ de naam van dit land:',
 *     check:      (rawInput) => matchesAnswer(rawInput, 'België'),
 *     onAccepted: () => { ... },  // called when the answer is accepted
 *     onSkip:     () => { ... },  // optional – skip button / Escape key
 *   });
 *
 *   overlay.hide();    // remove overlay, keep instance alive
 *   overlay.destroy(); // remove overlay and discard instance
 *
 * The `check` callback receives the raw (un-normalised) input string.
 * Use `matchesAnswer` or `matchesAnyAnswer` from `../quiz/answerNormalizer.js`
 * to build the check function in the calling scene.
 */

import { getAudioManager } from '../audio/AudioManager.js';

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const CSS = {
  backdrop: [
    'position:fixed',
    'left:0',
    'top:0',
    'width:var(--app-viewport-width,100vw)',
    'height:var(--app-viewport-height,100dvh)',
    'padding:calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
    'display:flex',
    'align-items:flex-start',
    'justify-content:center',
    'overflow:auto',
    'background:rgba(15,23,42,0.55)',
    'z-index:9999',
  ].join(';'),

  card: [
    'background:#1e293b',
    'border-radius:12px',
    'padding:24px 28px',
    'max-width:360px',
    'width:calc(100% - 48px)',
    'box-sizing:border-box',
    'display:flex',
    'flex-direction:column',
    'gap:14px',
    'margin-top:clamp(16px, 10vh, 96px)',
    `box-shadow:0 8px 32px rgba(0,0,0,0.60)`,
  ].join(';'),

  prompt: [
    'margin:0',
    'color:#f8fafc',
    `font-family:${FONT}`,
    'font-size:16px',
    'font-weight:600',
    'line-height:1.4',
  ].join(';'),

  input: [
    'width:100%',
    'box-sizing:border-box',
    'padding:10px 12px',
    'border-radius:6px',
    'border:2px solid #334155',
    'background:#0f172a',
    'color:#f8fafc',
    `font-family:${FONT}`,
    'font-size:16px',
    'outline:none',
    'transition:border-color 0.15s',
  ].join(';'),

  error: [
    'margin:0',
    'color:#f87171',
    `font-family:${FONT}`,
    'font-size:14px',
    'display:none',
  ].join(';'),

  btnRow: [
    'display:flex',
    'gap:10px',
    'justify-content:flex-end',
    'align-items:center',
  ].join(';'),
};

export default class TypingOverlay {
  /**
   * @param {HTMLElement} host  Parent element (e.g. `#game-root`).
   */
  constructor(host) {
    this._host   = host;
    this._root   = null;   // backdrop element
    this._input  = null;
    this._error  = null;
    this._params = null;

    this._boundKeydown = this._onKeydown.bind(this);
    this._boundInput   = this._onInput.bind(this);
    this._boundUnlockAudio = this._unlockAudio.bind(this);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Show the overlay.
   *
   * @param {{
   *   prompt:     string,
   *   check:      (rawInput: string) => boolean,
   *   onAccepted: () => void,
   *   onSkip?:    () => void,
   * }} params
   */
  show(params) {
    this._params = params;
    this._build(params);
  }

  /** Remove the overlay from the DOM without destroying the instance. */
  hide() {
    this._teardown();
    this._params = null;
  }

  /** Remove the overlay and release all references. */
  destroy() {
    this._teardown();
    this._params = null;
    this._host   = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _build({ prompt, onSkip }) {
    this._teardown();

    // ── Backdrop ───────────────────────────────────────────────────────────
    const backdrop = document.createElement('div');
    backdrop.style.cssText = CSS.backdrop;
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Antwoord invoeren');

    // ── Card ───────────────────────────────────────────────────────────────
    const card = document.createElement('div');
    card.style.cssText = CSS.card;

    // ── Prompt ─────────────────────────────────────────────────────────────
    const promptEl = document.createElement('p');
    promptEl.id          = 'typing-overlay-prompt';
    promptEl.textContent = prompt;
    promptEl.style.cssText = CSS.prompt;

    // ── Input ──────────────────────────────────────────────────────────────
    const input = document.createElement('input');
    input.type             = 'text';
    input.autocomplete     = 'off';
    input.autocapitalize   = 'none';
    input.spellcheck       = false;
    input.placeholder      = 'Typ je antwoord…';
    input.setAttribute('aria-labelledby', 'typing-overlay-prompt');
    input.style.cssText    = CSS.input;
    this._input = input;

    // ── Error feedback ────────────────────────────────────────────────────
    const error = document.createElement('p');
    error.textContent    = 'Helaas, probeer opnieuw!';
    error.style.cssText  = CSS.error;
    error.setAttribute('aria-live', 'polite');
    this._error = error;

    // ── Button row ─────────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = CSS.btnRow;

    if (onSkip) {
      const skipBtn = this._makeSecondaryButton('Overslaan', () => {
        this.hide();
        onSkip();
      });
      btnRow.appendChild(skipBtn);
    }

    const submitBtn = this._makePrimaryButton('Controleer', () => this._submit());
    btnRow.appendChild(submitBtn);

    // ── Assemble ───────────────────────────────────────────────────────────
    card.append(promptEl, input, error, btnRow);
    backdrop.appendChild(card);
    this._host.appendChild(backdrop);
    this._root = backdrop;

    // Focus the input on the next animation frame so the keyboard
    // appears on mobile and desktop focus rings render correctly.
    requestAnimationFrame(() => input.focus());

    document.addEventListener('keydown', this._boundKeydown);
    input.addEventListener('input', this._boundInput);
    input.addEventListener('focus', this._boundUnlockAudio);
    backdrop.addEventListener('pointerdown', this._boundUnlockAudio);
    backdrop.addEventListener('touchstart', this._boundUnlockAudio, { passive: true });
    backdrop.addEventListener('mousedown', this._boundUnlockAudio);
  }

  _submit() {
    const { check, onAccepted } = this._params ?? {};
    if (!check || !onAccepted) return;

    const raw = this._input?.value ?? '';
    if (check(raw)) {
      this._teardown();
      this._params = null;
      onAccepted();
    } else {
      this._showError();
    }
  }

  _showError() {
    if (!this._input || !this._error) return;

    this._input.style.borderColor = '#ef4444';
    this._error.style.display     = 'block';
    this._input.select();

    // Revert the border colour after a short delay but leave the
    // error text visible until the player starts typing again.
    setTimeout(() => {
      if (this._input) this._input.style.borderColor = '#334155';
    }, 1000);
  }

  /** Clear error feedback as soon as the player starts editing. */
  _onInput() {
    if (!this._error) return;
    this._error.style.display = 'none';
  }

  _onKeydown(e) {
    this._unlockAudio();

    if (e.key === 'Enter') {
      e.preventDefault();
      this._submit();
    } else if (e.key === 'Escape') {
      const { onSkip } = this._params ?? {};
      if (onSkip) {
        this.hide();
        onSkip();
      }
    }
  }

  _makePrimaryButton(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent    = label;
    btn.style.cssText  = [
      'background:#ff6b4a',
      'color:#ffffff',
      'border:none',
      'border-radius:6px',
      'padding:9px 18px',
      `font-family:${FONT}`,
      'font-size:14px',
      'font-weight:600',
      'cursor:pointer',
      'transition:background 0.12s',
    ].join(';');
    btn.addEventListener('mouseover', () => { btn.style.background = '#ea5a3a'; });
    btn.addEventListener('mouseout',  () => { btn.style.background = '#ff6b4a'; });
    btn.addEventListener('click', () => {
      this._unlockAudio();
      onClick();
    });
    return btn;
  }

  _makeSecondaryButton(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent   = label;
    btn.style.cssText = [
      'background:transparent',
      'color:#94a3b8',
      'border:1px solid #475569',
      'border-radius:6px',
      'padding:9px 16px',
      `font-family:${FONT}`,
      'font-size:14px',
      'cursor:pointer',
      'transition:background 0.12s,color 0.12s',
    ].join(';');
    btn.addEventListener('mouseover', () => {
      btn.style.background = '#1e3a5f';
      btn.style.color      = '#f8fafc';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.background = 'transparent';
      btn.style.color      = '#94a3b8';
    });
    btn.addEventListener('click', () => {
      this._unlockAudio();
      onClick();
    });
    return btn;
  }

  _unlockAudio() {
    getAudioManager().unlock();
  }

  _teardown() {
    document.removeEventListener('keydown', this._boundKeydown);
    if (this._input) {
      this._input.removeEventListener('input', this._boundInput);
      this._input.removeEventListener('focus', this._boundUnlockAudio);
    }
    this._root?.removeEventListener('pointerdown', this._boundUnlockAudio);
    this._root?.removeEventListener('touchstart', this._boundUnlockAudio);
    this._root?.removeEventListener('mousedown', this._boundUnlockAudio);
    this._root?.remove();
    this._root  = null;
    this._input = null;
    this._error = null;
  }
}
