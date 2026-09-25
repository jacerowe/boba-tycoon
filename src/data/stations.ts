import type { StationDef } from './types';

export const STATIONS: StationDef[] = [
  { id: 'cup', name: 'Cups', role: 'cup', radius: 0.42, visual: 'cupStack' },
  { id: 'tea', name: 'Tea', role: 'ingredient', ingredientId: 'tea', radius: 0.5, visual: 'teaUrn', brew: { maxKey: 'teaUrnMax', secKey: 'teaBrewSec' } },
  { id: 'milk', name: 'Milk', role: 'ingredient', ingredientId: 'milk', radius: 0.42, visual: 'milkJug' },
  { id: 'pearls', name: 'Pearls', role: 'ingredient', ingredientId: 'pearls', radius: 0.5, visual: 'pearlPot' },
  { id: 'popping', name: 'Popping boba', role: 'ingredient', ingredientId: 'popping', radius: 0.42, visual: 'poppingJar' },
  { id: 'ice', name: 'Ice', role: 'ingredient', ingredientId: 'ice', radius: 0.48, visual: 'iceBin' },
  { id: 'jelly', name: 'Jelly', role: 'ingredient', ingredientId: 'jelly', radius: 0.45, visual: 'jellyTub' },
  { id: 'taro', name: 'Taro', role: 'ingredient', ingredientId: 'taro', radius: 0.45, visual: 'taroTub' },
  { id: 'shaker', name: 'Shaker', role: 'shaker', radius: 0.45, visual: 'shaker' },
  { id: 'sealer', name: 'Sealer', role: 'sealer', radius: 0.5, visual: 'sealer' },
  { id: 'counter', name: 'Counter', role: 'counter', radius: 0.9, visual: 'cartCounter' },
  { id: 'shopCounter', name: 'Counter', role: 'counter', radius: 1.2, visual: 'shopCounter' },
  { id: 'bin', name: 'Bin', role: 'bin', radius: 0.36, visual: 'bin' },
  { id: 'menuBoard', name: 'Menu', role: 'menuBoard', radius: 0.35, visual: 'menuBoard' },
];
