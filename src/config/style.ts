// Every color in the game lives here. Bold, warm, candy-shop palette.
// Outlines are a deep plum instead of black so everything stays soft and warm.

export const palette = {
  outline: '#4a2545',
  ink: '#4a2545',
  shadow: '#4a2545',

  sky: '#ffd9b8',
  skyRush: '#ffb8a8',
  fog: '#ffd9b8',
  hemiSky: '#fff4e6',
  hemiGround: '#f3b98f',
  sun: '#fff1dc',

  sidewalk: '#f5dcc4',
  sidewalkLine: '#e3bf9f',
  plazaA: '#ffcdb8',
  plazaB: '#ffd6c3',
  plazaLine: '#f2b39b',
  curb: '#fff5e8',
  road: '#9a90b8',
  roadLine: '#fff1c9',
  grass: '#a6dd7f',
  grassDark: '#86cc66',
  lotDirt: '#eccb9c',
  lotDirtDark: '#dfb784',
  fence: '#fff3e0',
  fencePost: '#f0c890',
  treeLeaf: '#7fcf6a',
  treeLeaf2: '#a2e07f',
  treeTrunk: '#b9835a',
  flower: ['#ff8fb1', '#ffd166', '#b18ae8', '#ffffff'],

  cartBody: '#ff8a7a',
  cartTrim: '#ffd166',
  cartMint: '#6ad8b8',
  cartWood: '#e8a86c',
  cartWheel: '#6b4a6e',
  umbrellaA: '#ff6f91',
  umbrellaB: '#fff4e4',
  metal: '#d5dcef',
  metalDark: '#a9b3cf',
  stationBase: '#fff1e0',
  stationBaseSide: '#fff8ef',
  /** Each station's body color, so kids can tell them apart at a glance. */
  stationColors: {
    cupStack: '#ff9fc4', teaUrn: '#ffae5c', milkJug: '#7fb6e8', pearlPot: '#b18ae8', poppingJar: '#ff7fa3',
    iceBin: '#7fd3ff', jellyTub: '#8fdc7a', taroTub: '#c7a2f5', shaker: '#ffd166', sealer: '#5fd3b0', bin: '#7fb6e8', menuBoard: '#e8a86c',
  } as Record<string, string>,
  sealerBody: '#6ad8b8',
  sealerPress: '#ffd166',
  lightOn: '#ff5a7a',
  lightOff: '#9c6a7a',
  binBody: '#7fb6e8',

  shopFloorA: '#ffe9d1',
  shopFloorB: '#ffdcbc',
  shopWall: '#fff4ea',
  shopWallTrim: '#ff8a7a',
  shopRoof: '#ff6f91',
  shopRoofB: '#fff4e4',
  shopSign: '#ffd166',
  queueRope: '#ff6f91',
  queuePost: '#ffd166',
  seat: '#6ad8b8',
  table: '#fff4ea',
  ghostOutline: '#ffffff',
  forSale: '#ff5a5f',

  // Drinks: the visual star. Distinct, saturated, readable at thumbnail size.
  cupShell: '#ffffff',
  cupRim: '#ffffff',
  lidFilm: '#fff0f6',
  lidPrint: '#ff6f91',
  strawColors: ['#ff6f91', '#6ad8b8', '#ffd166', '#b18ae8', '#7fb6e8'],
  tea: '#d0782a',
  milk: '#fff1dc',
  milkTea: '#e2b07c',
  taro: '#b58af0',
  strawberrySyrup: '#ff6f96',
  foam: '#fff6e6',
  foamPerfect: '#fffbe8',
  pearl: '#3b2418',
  pearlShine: '#8a5a3c',
  popping: '#ff3d6e',
  jelly: ['#3fdc7e', '#ffc61a', '#ff6f9e', '#4fb4ff'],
  ice: '#e6f7ff',
  sparkle: '#fff27a',

  // Characters
  skin: ['#ffe0c7', '#f5c9a6', '#e8b08a', '#c98b61', '#9c6644', '#74492f'],
  shirts: ['#ff8a7a', '#6ad8b8', '#ffd166', '#b18ae8', '#7fb6e8', '#ff9fc4', '#9be07a', '#ffb65c'],
  hats: ['#ff6f91', '#4a90e2', '#ffd166', '#6ad8b8', '#ffffff', '#b18ae8', '#ff8a4a'],
  hair: ['#3b2418', '#6b3e26', '#e0b060', '#1f1a24', '#b0522e'],
  playerShirt: '#6ad8b8',
  playerApron: '#ff6f91',
  playerCap: '#ff6f91',
  playerSkin: '#f5c9a6',
  playerPants: '#6b4a6e',

  // Particles and FX
  coin: '#ffcf3f',
  coinEdge: '#e89a1a',
  heart: '#ff5a8a',
  anger: '#ff5a5f',
  steam: '#ffffff',
  dust: '#f3d2ab',
  storm: '#7a7294',
  confetti: ['#ff6f91', '#6ad8b8', '#ffd166', '#b18ae8', '#7fb6e8', '#ff8a4a'],
  splash: '#e2b07c',
  glow: '#fff27a',
  routeDot: '#ff6f91',
  padRing: '#ffd166',
  padFill: '#6ad8b8',
  padBase: '#fff4e6',

  // UI
  uiPanel: '#fff6ea',
  uiPanelEdge: '#4a2545',
  uiText: '#4a2545',
  uiAccent: '#ff6f91',
  uiAccent2: '#ffd166',
  uiGood: '#4fcf8f',
  uiBad: '#ff5a5f',
  uiMuted: '#b79aa9',
  comboColors: ['#ffffff', '#ffd166', '#ff9f43', '#ff6f91', '#b18ae8'],
  rushBorder: '#ff6f91',
  vignette: '#4a2545',
} as const;

export const fonts = {
  chunky: '900 1em ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif',
  family: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

/** Push palette values into CSS custom properties so ui.css never hard-codes a color. */
export function applyCssPalette(root: HTMLElement): void {
  const p = palette;
  const vars: Record<string, string> = {
    '--ink': p.ink, '--panel': p.uiPanel, '--panel-edge': p.uiPanelEdge, '--text': p.uiText,
    '--accent': p.uiAccent, '--accent2': p.uiAccent2, '--good': p.uiGood, '--bad': p.uiBad,
    '--muted': p.uiMuted, '--sky': p.sky, '--rush-border': p.rushBorder, '--vignette': p.vignette,
    '--coin': p.coin, '--coin-edge': p.coinEdge, '--font': fonts.family,
    '--combo-0': p.comboColors[0], '--combo-1': p.comboColors[1], '--combo-2': p.comboColors[2],
    '--combo-3': p.comboColors[3], '--combo-4': p.comboColors[4],
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
