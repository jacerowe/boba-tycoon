// Every UI string lives here. Keep prompts ≤5 words; icons do the heavy lifting.
export const S = {
  title: 'Boba Tycoon',
  tapToStart: 'Tap to start',
  continue: 'Tap to continue',
  // Feedback words
  grab: 'grab!',
  pour: 'POUR!',
  swirl: 'swirl!',
  scoop: 'SCOOP!',
  pop: 'POP POP!',
  clink: 'clink',
  jiggle: 'JIGGLE!',
  plop: 'PLOP!',
  shake: 'SHAKE SHAKE SHAKE',
  ok: 'OK',
  great: 'GREAT!',
  perfect: 'PERFECT!',
  chunk: 'CHUNK!',
  go: 'GO!',
  notYet: 'not yet!',
  handsFull: 'hands full!',
  noOrders: 'no orders',
  empty: 'empty!',
  refill: 'refill!',
  brewing: 'brewing…',
  binned: 'toss!',
  hmph: 'hmph!',
  tapToSeal: 'TAP!',
  // Rush
  rushIncoming: 'RUSH INCOMING!',
  rushGo: 'DRINK RUSH!',
  rushGoSub: 'GO GO GO!',
  serveFastCombo: 'Serve fast = COMBO!',
  comboBroken: 'COMBO BROKEN',
  combo: 'COMBO',
  claim: 'Claim',
  // Beats
  'beat.firstOrder': 'Make a Pearl Tea!',
  'beat.impatient': 'Quick = happy!',
  'beat.carryTray': 'Carry two!',
  'beat.practiceRush': 'Serve fast = COMBO!',
  'beat.secondTopping': 'New topping!',
  'beat.goal': 'Save for a shop!',
  walkoutLesson: 'Quick = happy!',
  newRecipe: 'New drink!',
  // Menu card
  addToMenu: 'Add it?',
  paysMore: 'pays more',
  takesLonger: 'takes longer',
  yes: 'Yes',
  no: 'Not now',
  menu: 'Menu',
  // Shop
  tinyShop: 'Tiny Boba Shop',
  comingSoon: 'Coming soon!',
  skip: 'Skip',
  // Settings
  settings: 'Settings',
  music: 'Music',
  sfx: 'Sounds',
  haptics: 'Buzz',
  motion: 'Less motion',
  reset: 'Reset',
  resetHold: 'Hold to reset',
  build: 'Build',
  close: 'Close',
  on: 'On',
  off: 'Off',
  // Results
  served: 'served',
  bestCombo: 'best',
  perfects: 'perfect',
  cash: 'cash',
} as const;

export type StringKey = keyof typeof S;

export function t(key: string): string {
  return (S as Record<string, string>)[key] ?? key;
}
