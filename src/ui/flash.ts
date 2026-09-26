// Photosensitivity: a flash may only fire if the last one was at least 1/maxHz ago.
export function canFlash(nowMs: number, lastMs: number, maxHz: number): boolean {
  return nowMs - lastMs >= 1000 / maxHz;
}
