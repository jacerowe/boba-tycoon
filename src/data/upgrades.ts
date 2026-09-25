import type { UpgradeDef } from './types';
import { balance } from '../config/balance';

const U = balance.upgrades;
const both = ['cart', 'tinyShop'];

// Every upgrade fixes a problem the player can see. No "+X% profit" upgrades.
// A pad appears only once `showWhen` holds (its problem is visible).
export const UPGRADES: UpgradeDef[] = [
  // ---- Cart -----------------------------------------------------------------
  {
    id: 'carryTray', name: 'Carry tray', icon: 'tray', cost: U.carryTray.cost, stages: both,
    problemItSolves: 'Two customers are waiting but you can only carry one drink.',
    showWhen: { kind: 'beat', atLeast: 'carryTray' },
    effect: { kind: 'carry', value: 2 },
  },
  {
    id: 'carry3', name: 'Carry 3', icon: 'carry3', cost: U.carry3.cost, stages: both, requires: ['carryTray'],
    problemItSolves: 'Your hands are full while more orders pile up.',
    showWhen: { kind: 'all', of: [{ kind: 'beat', atLeast: 'bottlenecks' }, { kind: 'stat', stat: 'fullHands', atLeast: U.carry3.showFullHands }] },
    effect: { kind: 'carry', value: 3 },
  },
  {
    id: 'fasterPour', name: 'Faster pour', icon: 'fastPour', cost: U.fasterPour.cost, stages: both,
    problemItSolves: 'You stand around waiting for the tea and milk to pour.',
    showWhen: { kind: 'all', of: [{ kind: 'beat', atLeast: 'bottlenecks' }, { kind: 'stat', stat: 'pourSec', atLeast: U.fasterPour.showWaitSec }] },
    effect: { kind: 'stepMult', steps: ['tea', 'milk', 'taro'], mult: U.fasterPourMult },
  },
  {
    id: 'fasterSealer', name: 'Faster sealer', icon: 'fastSeal', cost: U.fasterSealer.cost, stages: both,
    problemItSolves: 'The sealer holds your cup too long after CHUNK.',
    showWhen: { kind: 'all', of: [{ kind: 'beat', atLeast: 'bottlenecks' }, { kind: 'stat', stat: 'sealWaitSec', atLeast: U.fasterSealer.showWaitSec }] },
    effect: { kind: 'sealRelease', value: U.fasterSealerRelease },
  },
  {
    id: 'biggerPearlPot', name: 'Bigger pearl pot', icon: 'bigPot', cost: U.biggerPearlPot.cost, stages: both,
    problemItSolves: 'The pearl pot keeps running empty.',
    showWhen: { kind: 'all', of: [{ kind: 'beat', atLeast: 'bottlenecks' }, { kind: 'stat', stat: 'pearlEmptyHits', atLeast: U.biggerPearlPot.showEmptyHits }] },
    effect: { kind: 'stockMax', ingredient: 'pearls', maxKey: 'pearlsMaxBig' },
  },
  {
    id: 'bench', name: 'Bench', icon: 'bench', cost: U.bench.cost, stages: ['cart'],
    problemItSolves: 'Customers in line get angry standing around.',
    showWhen: { kind: 'all', of: [{ kind: 'beat', atLeast: 'bottlenecks' }, { kind: 'stat', stat: 'angry', atLeast: U.bench.showAngry }] },
    effect: { kind: 'bench' },
  },
  {
    id: 'tinyShop', name: 'Tiny Boba Shop', icon: 'shop', cost: U.tinyShop.cost, stages: ['cart'],
    problemItSolves: 'The cart is bursting at the seams.',
    showWhen: { kind: 'beat', atLeast: 'goal' },
    effect: { kind: 'stage', stage: 'tinyShop' },
  },

  // ---- Tiny Shop ------------------------------------------------------------
  {
    id: 'carry5', name: 'Carry 5', icon: 'carry5', cost: U.carry5.cost, stages: ['tinyShop'], requires: ['carry3'],
    problemItSolves: 'Big groups order at once and you run back and forth.',
    showWhen: { kind: 'stat', stat: 'fullHands', atLeast: U.carry5.showFullHands, scope: 'stage' },
    effect: { kind: 'carry', value: 5 },
  },
  {
    id: 'carry8', name: 'Carry 8', icon: 'carry8', cost: U.carry8.cost, stages: ['tinyShop'], requires: ['carry5'],
    problemItSolves: 'Your tray is full while the line keeps growing.',
    showWhen: { kind: 'stat', stat: 'fullHands', atLeast: U.carry8.showFullHands, scope: 'stage' },
    effect: { kind: 'carry', value: 8 },
  },
  {
    id: 'carry12', name: 'Carry 12', icon: 'carry12', cost: U.carry12.cost, stages: ['tinyShop'], requires: ['carry8'],
    problemItSolves: 'Rush crowds need a whole tower of drinks.',
    showWhen: { kind: 'stat', stat: 'fullHands', atLeast: U.carry12.showFullHands, scope: 'stage' },
    effect: { kind: 'carry', value: 12 },
  },
  {
    id: 'secondTea', name: 'Second tea machine', icon: 'tea2', cost: U.secondTea.cost, stages: ['tinyShop'],
    problemItSolves: 'You wait at the tea machine while it brews.',
    showWhen: { kind: 'stat', stat: 'brewWaitSec', atLeast: U.secondTea.showBrewWaitSec, scope: 'stage' },
    effect: { kind: 'addStation', slot: 'tea2' },
  },
  {
    id: 'pearlAutoRefill', name: 'Pearl auto-refill', icon: 'autoRefill', cost: U.pearlAutoRefill.cost, stages: ['tinyShop'],
    problemItSolves: 'Refilling pearls by hand breaks your flow.',
    showWhen: { kind: 'stat', stat: 'pearlEmptyHits', atLeast: U.pearlAutoRefill.showEmptyHits, scope: 'stage' },
    effect: { kind: 'autoRefill', ingredient: 'pearls' },
  },
  {
    id: 'fasterShoes', name: 'Faster shoes', icon: 'shoes', cost: U.fasterShoes.cost, stages: ['tinyShop'],
    problemItSolves: 'The shop is big and the walks are long.',
    showWhen: { kind: 'stat', stat: 'walkMeters', atLeast: U.fasterShoes.showWalkMeters, scope: 'stage' },
    effect: { kind: 'moveSpeed', mult: U.fasterShoesMult },
  },
  {
    id: 'seating', name: 'Seating', icon: 'seats', cost: U.seating.cost, stages: ['tinyShop'],
    problemItSolves: 'Customers in the long line get cranky on their feet.',
    showWhen: { kind: 'stat', stat: 'angry', atLeast: U.seating.showAngry, scope: 'stage' },
    effect: { kind: 'seating' },
  },
  {
    id: 'extraQueue', name: 'Extra queue spot', icon: 'queue', cost: U.extraQueue.cost, stages: ['tinyShop'],
    problemItSolves: 'Customers walk away because the line is full.',
    showWhen: { kind: 'stat', stat: 'balks', atLeast: U.extraQueue.showBalks, scope: 'stage' },
    effect: { kind: 'queueSpots', add: U.extraQueueSpots },
  },
];
