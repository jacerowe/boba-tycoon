// Player settings (per device). Stored inside the save's profile.
export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  reducedMotion: boolean;
}

export function defaultSettings(): Settings {
  let reduced = false;
  try { reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { /* ignore */ }
  return { music: true, sfx: true, haptics: true, reducedMotion: reduced };
}
