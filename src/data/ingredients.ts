import type { IngredientDef } from './types';
import { palette } from '../config/style';

export const INGREDIENTS: IngredientDef[] = [
  {
    id: 'tea', name: 'Black tea', kind: 'base', stationDef: 'tea', color: palette.tea, stepKey: 'tea', word: 'POUR!',
    visual: { type: 'pour', fill: 0.66 },
  },
  {
    id: 'milk', name: 'Milk', kind: 'liquid', stationDef: 'milk', color: palette.milk, stepKey: 'milk', word: 'swirl!',
    visual: { type: 'mix', fillAdd: 0.2, mix: 0.5 },
  },
  {
    id: 'pearls', name: 'Tapioca pearls', kind: 'topping', stationDef: 'pearls', color: palette.pearl, stepKey: 'pearls', word: 'SCOOP!',
    visual: { type: 'spheres', count: [7, 10], size: 0.055, shine: true },
    stock: { maxKey: 'pearlsMax', startKey: 'pearlsStart' },
  },
  {
    id: 'popping', name: 'Strawberry popping boba', kind: 'topping', stationDef: 'popping', color: palette.popping, stepKey: 'popping', word: 'POP POP!',
    visual: { type: 'spheres', count: [6, 8], size: 0.05, shine: true, syrup: { color: palette.strawberrySyrup, height: 0.2 } },
    stock: { maxKey: 'poppingMax' },
  },
  {
    id: 'ice', name: 'Ice', kind: 'ice', stationDef: 'ice', color: palette.ice, stepKey: 'ice', word: 'clink',
    visual: { type: 'ice', count: [4, 5], fillAdd: 0.08 },
  },
  {
    id: 'jelly', name: 'Rainbow jelly', kind: 'topping', stationDef: 'jelly', color: palette.jelly[0], stepKey: 'jelly', word: 'JIGGLE!',
    visual: { type: 'cubes', count: [6, 8], size: 0.06, colors: [...palette.jelly] },
    stock: { maxKey: 'jellyMax' },
  },
  {
    id: 'taro', name: 'Taro', kind: 'base', stationDef: 'taro', color: palette.taro, stepKey: 'taro', word: 'PLOP!',
    visual: { type: 'bottomLayer', height: 0.24, fillAdd: 0.5 },
    stock: { maxKey: 'taroMax' },
  },
];
