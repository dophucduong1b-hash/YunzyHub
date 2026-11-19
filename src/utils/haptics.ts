/**
 * Cross-platform tactile haptic feedback engine.
 * - Uses navigator.vibrate on Android / supporting devices.
 * - Uses an in-viewport native iOS 17.4+ `<input type="checkbox" switch>` + `<label htmlFor>`
 *   for direct physical tap haptics (required on iOS 26 / WebKit 2026+) plus programmatic fallback
 *   with duplicate-tap suppression.
 */

export const IOS_HAPTIC_SWITCH_ID = '__yunzy_ios_haptic_switch__';

let iosSwitchLabel: HTMLLabelElement | null = null;
let iosSwitchInput: HTMLInputElement | null = null;
let hapticsEnabled = true;
let lastNativeToggleTs = -1000;
const listeners = new Set<() => void>();

export function isIOSHapticsSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function getHapticsEnabled(): boolean {
  return hapticsEnabled;
}

export function setHapticsEnabled(enabled: boolean): void {
  if (hapticsEnabled === enabled) return;
  hapticsEnabled = enabled;
  listeners.forEach((listener) => listener());
}

export function subscribeHapticsEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function ensureIOSSwitch(): { label: HTMLLabelElement; input: HTMLInputElement } | null {
  if (typeof document === 'undefined' || !document.body) return null;

  if (
    iosSwitchLabel &&
    iosSwitchInput &&
    document.body.contains(iosSwitchLabel) &&
    document.body.contains(iosSwitchInput)
  ) {
    return { label: iosSwitchLabel, input: iosSwitchInput };
  }

  let input = document.getElementById(IOS_HAPTIC_SWITCH_ID) as HTMLInputElement | null;
  let label = document.querySelector(
    `label[for="${IOS_HAPTIC_SWITCH_ID}"]`
  ) as HTMLLabelElement | null;

  if (!input) {
    input = document.createElement('input');
    input.id = IOS_HAPTIC_SWITCH_ID;
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.001;pointer-events:none;overflow:hidden;margin:0;padding:0;border:0;z-index:-1;';
    document.body.appendChild(input);
  }

  if (!label) {
    label = document.createElement('label');
    label.htmlFor = IOS_HAPTIC_SWITCH_ID;
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.001;pointer-events:none;overflow:hidden;margin:0;padding:0;border:0;z-index:-1;';
    document.body.appendChild(label);
  }

  if (!input.dataset.yunzyHapticBound) {
    input.dataset.yunzyHapticBound = '1';
    input.addEventListener('change', () => {
      lastNativeToggleTs = nowMs();
    });
  }

  iosSwitchInput = input;
  iosSwitchLabel = label;
  return { label, input };
}

function triggerIOSTapticClick(force = false): void {
  if (!hapticsEnabled) return;
  if (!force && nowMs() - lastNativeToggleTs < 90) {
    return;
  }
  try {
    const pair = ensureIOSSwitch();
    if (!pair) return;
    pair.label.click();
  } catch {
    // Gracefully ignore if browser restricts synthetic switch toggle
  }
}

function vibrate(pattern: number | number[]): boolean {
  if (!hapticsEnabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export const haptic = {
  /** Pre-warm native iOS switch element in viewport before first user interaction */
  warmup(): void {
    if (!isIOSHapticsSupported()) return;
    if (typeof document === 'undefined') return;
    if (document.body) {
      ensureIOSSwitch();
    } else {
      document.addEventListener('DOMContentLoaded', () => ensureIOSSwitch(), { once: true });
    }
  },

  setEnabled(enabled: boolean): void {
    setHapticsEnabled(enabled);
  },

  isEnabled(): boolean {
    return getHapticsEnabled();
  },

  /** Subtle tick for tab switching, segmented controls, filters */
  selection(): void {
    if (!hapticsEnabled) return;
    if (isIOSHapticsSupported()) {
      triggerIOSTapticClick();
      return;
    }
    vibrate(8);
  },

  /** Crisp light impact for card taps, buttons, modal open/close */
  light(): void {
    if (!hapticsEnabled) return;
    if (isIOSHapticsSupported()) {
      triggerIOSTapticClick();
      return;
    }
    vibrate(12);
  },

  /** Distinct medium impact for favoriting or toggling primary state */
  medium(): void {
    if (!hapticsEnabled) return;
    if (isIOSHapticsSupported()) {
      triggerIOSTapticClick();
      return;
    }
    vibrate(20);
  },

  /** Positive confirmation double-tap for save/backup completion */
  success(): void {
    if (!hapticsEnabled) return;
    if (isIOSHapticsSupported()) {
      triggerIOSTapticClick();
      setTimeout(() => triggerIOSTapticClick(true), 55);
      return;
    }
    vibrate([12, 40, 18]);
  },

  /** Noticeable warning pulse for destructive actions */
  warning(): void {
    if (!hapticsEnabled) return;
    if (isIOSHapticsSupported()) {
      triggerIOSTapticClick();
      setTimeout(() => triggerIOSTapticClick(true), 65);
      setTimeout(() => triggerIOSTapticClick(true), 130);
      return;
    }
    vibrate([20, 45, 20, 45, 25]);
  },
};
