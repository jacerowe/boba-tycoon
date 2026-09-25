import type { Condition } from '../data/types';
import { beatIndex } from '../data/beats';
import type { ShopState, WorldState, StatKey } from './types';

export function evalCondition(c: Condition, world: WorldState, shop: ShopState): boolean {
  switch (c.kind) {
    case 'beat': return beatIndex(world.director.beat) >= beatIndex(c.atLeast);
    case 'stage': return shop.stageId === c.is;
    case 'owned': return shop.upgrades.includes(c.id);
    case 'notOwned': return !shop.upgrades.includes(c.id);
    case 'stat': {
      const stats = c.scope === 'stage' ? shop.stageStats : shop.stats;
      return (stats[c.stat as StatKey] ?? 0) >= c.atLeast;
    }
    case 'time': return world.time >= c.atLeast;
    case 'all': return c.of.every((x) => evalCondition(x, world, shop));
    case 'any': return c.of.some((x) => evalCondition(x, world, shop));
  }
}
