import type { GameEventDef } from './types';
import { balance } from '../config/balance';

const R = balance.rush;

const rushMods = {
  worldSpeed: R.speedMult,
  playerSpeed: R.playerSpeedMult,
  patienceDrain: R.patienceDrainMult,
  brewSpeed: R.brewSpeedMult,
  spawnRate: R.spawnMult,
  stepSpeed: R.speedMult,
};

// Rush is the first generic timed GameEvent: warning, active modifiers, rewards, pluggable trigger.
// New events (Boba Mania, Tour Bus, VIP...) are defined here as data.
export const GAME_EVENTS: GameEventDef[] = [
  {
    id: 'practiceRush', name: 'Practice Rush', warningSec: R.warningSec, durationSec: [R.practiceSec, R.practiceSec],
    modifiers: { ...rushMods, patienceDrain: R.practicePatienceDrainMult }, comboTable: 'practice', trigger: { kind: 'scripted' }, resultsCard: true,
    crowdSize: R.crowdSize, patienceMult: R.practicePatienceMult, claimBonusPerServe: R.claimBonusPerServe,
    crowdEarly: true, crowdRecipe: 'pearlTea',
  },
  {
    id: 'rush', name: 'Drink Rush', warningSec: R.warningSec, durationSec: R.randomSec,
    modifiers: rushMods, comboTable: 'stage',
    trigger: { kind: 'random', minGapSec: R.minGapSec, baseChancePerSec: R.baseChancePerSec, chanceRampPerSec: R.chanceRampPerSec, enabledFromBeat: 'bottlenecks' },
    resultsCard: true, crowdSize: R.crowdSize, patienceMult: 1, claimBonusPerServe: R.claimBonusPerServe,
  },
];
