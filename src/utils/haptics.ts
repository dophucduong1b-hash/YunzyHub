/**
 * Cross-platform tactile haptic feedback engine.
 * - Uses navigator.vibrate on Android / supporting devices.
 * - Uses the native iOS Safari 17.4+ `<input type="checkbox" switch>` Taptic Engine trick
 *   synchronously during user interaction events so iPhones feel genuine tactile clicks.
 */

let iosSwitchLabel: HTMLLabelElement | null = null;
let iosSwitchInput: HTMLInputElement | null = null;

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function triggerIOSTapticClick(): void {
  if (typeof document === 'undefined' || !document.body) return;
  try {
    if (!iosSwitchLabel || !iosSwitchInput || !document.body.contains(iosSwitchLabel)) {
      const id = '__yunzy_ios_haptic_switch__';
      const existing = document.getElementById(id) as HTMLInputElement | null;
      if (existing && existing.parentElement instanceof HTMLLabelElement) {
        iosSwitchInput = existing;
        iosSwitchLabel = existing.parentElement;
      } else {
        const label = document.createElement('label');
        label.setAttribute('aria-hidden', 'true');
        label.style.position = 'fixed';
        label.style.top = '-9999px';
        label.style.left = '-9999px';
        label.style.width = '1px';
        label.style.height = '1px';
        label.style.opacity = '0';
        label.style.pointerEvents = 'none';

        const input = document.createElement('input');
        input.id = id;
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;

        label.appendChild(input);
        document.body.appendChild(label);

        iosSwitchLabel = label;
        iosSwitchInput = input;
      }
    }
    iosSwitchLabel.click();
  } catch {
    // Gracefully ignore if browser restricts synthetic switch toggle
  }
}

function vibrate(pattern: number | number[]): boolean {
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
  /** Subtle tick for tab switching, segmented controls, filters */
  selection(): void {
    if (isIOSDevice()) {
      triggerIOSTapticClick();
      return;
    }
    vibrate(6);
  },

  /** Crisp light impact for card taps, buttons, modal open/close */
  light(): void {
    if (isIOSDevice()) {
      triggerIOSTapticClick();
      return;
    }
    vibrate(10);
  },

  /** Distinct medium impact for favoriting or toggling primary state */
  medium(): void {
    if (isIOSDevice()) {
      triggerIOSTapticClick();
      return;
    }
    vibrate(16);
  },

  /** Positive confirmation double-tap for save/backup completion */
  success(): void {
    if (isIOSDevice()) {
      triggerIOSTapticClick();
      setTimeout(triggerIOSTapticClick, 65);
      return;
    }
    vibrate([10, 45, 14]);
  },

  /** Noticeable warning pulse for destructive actions */
  warning(): void {
    if (isIOSDevice()) {
      triggerIOSTapticClick();
      setTimeout(triggerIOSTapticClick, 80);
      return;
    }
    vibrate([18, 50, 18]);
  },
};
