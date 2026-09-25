import type { OnboardingBeat } from './types';

// The first 10 minutes, in order. Prompts are ≤5 words; arrows and glow do the work.
// Prompt text lives in ui/strings.ts keyed by beat id.
export const BEATS: OnboardingBeat[] = [
  { id: 'start', prompt: null },
  { id: 'firstOrder', prompt: 'beat.firstOrder' },
  { id: 'impatient', prompt: 'beat.impatient' },
  { id: 'scriptedWalkout', prompt: null },
  { id: 'carryTray', prompt: 'beat.carryTray' },
  { id: 'practiceRush', prompt: 'beat.practiceRush' },
  { id: 'bottlenecks', prompt: null },
  { id: 'secondTopping', prompt: 'beat.secondTopping' },
  { id: 'goal', prompt: 'beat.goal' },
  { id: 'reveal', prompt: null },
  { id: 'shop', prompt: null },
];

export function beatIndex(id: string): number {
  const i = BEATS.findIndex((b) => b.id === id);
  if (i < 0) throw new Error(`Unknown beat: ${id}`);
  return i;
}
