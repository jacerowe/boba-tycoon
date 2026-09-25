import type { RecipeDef } from './types';

// Every builtin recipe has an explicit, ordered step list.
// Runtime (player-made) recipes can be added to the registry with origin: 'player'.
export const RECIPES: RecipeDef[] = [
  { id: 'pearlTea', name: 'Pearl Tea', steps: ['cup', 'tea', 'pearls', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 0 },
  { id: 'pearlMilkTea', name: 'Pearl Milk Tea', steps: ['cup', 'tea', 'milk', 'pearls', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 1 },
  { id: 'berryPopMilkTea', name: 'Berry Pop Milk Tea', steps: ['cup', 'tea', 'milk', 'pearls', 'popping', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 3 },
  { id: 'icedJellyTea', name: 'Iced Jelly Tea', steps: ['cup', 'tea', 'ice', 'jelly', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 2 },
  { id: 'taroPearlMilk', name: 'Taro Pearl Milk', steps: ['cup', 'taro', 'milk', 'pearls', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 4 },
  { id: 'rainbowTaroSlush', name: 'Rainbow Taro Slush', steps: ['cup', 'taro', 'ice', 'milk', 'popping', 'jelly', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 0 },
];
