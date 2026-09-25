// Haptics via navigator.vibrate only. iOS Safari has no vibrate: everything no-ops cleanly
// there and the settings toggle is hidden.
import { feel } from '../config/feel';

export const hapticsSupported: boolean = (() => {
  try { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; } catch { return false; }
})();

export class Haptics {
  enabled = true;

  private buzz(p: number | number[]): void {
    if (!this.enabled || !hapticsSupported) return;
    try { navigator.vibrate(p); } catch { /* ignore */ }
  }

  tick(): void { this.buzz(feel.haptics.tick); }
  seal(): void { this.buzz(feel.haptics.seal); }
  perfect(): void { this.buzz(feel.haptics.perfect); }
  purchase(): void { this.buzz(feel.haptics.purchase); }
  tierUp(): void { this.buzz(feel.haptics.tierUp); }
}
