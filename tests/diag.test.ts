import { it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { Bot, COMPETENT, CASUAL, runBot } from '../src/sim/bot';
import { defaultRegistry } from '../src/data/registry';
const reg = defaultRegistry();
it.runIf(process.env.DIAG)('diag', () => {
  for (const [name, prof] of [['competent', COMPETENT], ['casual', CASUAL]] as const) {
    for (const seed of [1, 4]) {
      const sim = Sim.create(seed, reg);
      const bot = new Bot(sim, prof, seed * 7 + 1);
      const log: string[] = [];
      let lastMin = -1; let walkouts = 0; let spent = 0;
      runBot(sim, bot, { maxSec: 20 * 60, until: (s) => s.shop.stageId === 'tinyShop', onTick: (s) => {
        for (const e of s.events) { if (e.type === 'Walkout') walkouts++; if (e.type === 'UpgradePurchased') { spent += reg.upgrade(e.upgradeId).cost; log.push(`  buy ${e.upgradeId} @${(s.world.time/60).toFixed(2)}`);} if (e.type === 'RushEnded') log.push(`  rush ${e.eventId} served ${e.results.served} best x${e.results.bestMult} walkouts ${e.results.walkouts} @${(s.world.time/60).toFixed(2)}`); }
        const m = Math.floor(s.world.time / 60);
        if (m !== lastMin) { lastMin = m; log.push(`  min ${m}: cash ${s.cash.toFixed(0)} serves ${s.shop.stats.serves} rep ${s.shop.reputation.toFixed(2)} walkouts ${walkouts} q ${s.world.customers.filter(c=>c.phase==='queued').length} cap ${s.player.capacity}`); }
      }});
      console.log(`${name} seed ${seed} t=${(sim.world.time/60).toFixed(2)} spent ${spent} earned ${sim.shop.stats.cashEarned}\n` + log.join('\n'));
    }
  }
});
