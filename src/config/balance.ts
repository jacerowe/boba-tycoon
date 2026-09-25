// Balance: economy, spawns, patience, combos, pacing. Knobs, not specs.
// Documented in docs/TUNING.md. Override from the URL: ?balance.rush.speedMult=1.8
import { applyUrlOverrides } from './overrides';

export const balance = {
  economy: {
    startCash: 0,
    /** Tip by shake tier before reputation scaling. */
    tips: { ok: 0, great: 2, perfect: 4 },
    /** Reputation (0..5 stars) scales tips: tipMult = lerp(min, max, rep/5). */
    tipRepMin: 0.6,
    tipRepMax: 1.5,
    /** During a rush, combo multiplier applies to tips, plus this share of the price. */
    comboPriceShare: 0.3,
  },

  /** Recipe prices (coins). Complex recipes pay more. */
  prices: {
    pearlTea: 5,
    pearlMilkTea: 7,
    berryPopMilkTea: 11,
    icedJellyTea: 10,
    taroPearlMilk: 13,
    rainbowTaroSlush: 16,
  } as Record<string, number>,

  reputation: {
    start: 3,
    max: 5,
    /** Gains per serve, plus speed bonus if served above this patience fraction. */
    serveGain: 0.05,
    fastServeFraction: 0.6,
    fastServeBonus: 0.04,
    perfectBonus: 0.03,
    walkoutLoss: 0.28,
    /** Traffic multiplier = lerp(min, max, rep/5). */
    trafficMin: 0.55,
    trafficMax: 1.6,
    /** Stars show in the HUD from this onboarding beat. */
  },

  patience: {
    /** Seconds from full to walkout, per stage. Bench/seats slow the drain. */
    baseSec: { cart: 40, tinyShop: 44 } as Record<string, number>,
    /** Random spread ±fraction. */
    spread: 0.15,
    /** Mood thresholds (fraction of patience left): happy > a, neutral > b, angry > c, furious > 0. */
    happyAbove: 0.62,
    neutralAbove: 0.36,
    angryAbove: 0.16,
    /** Seated customers drain at this multiplier. */
    seatedDrain: 0.6,
    /** First customer (tutorial) patience seconds — effectively endless. */
    tutorialSec: 600,
    /** Scripted walkout customer's patience (seconds). */
    scriptedWalkoutSec: 9,
  },

  traffic: {
    /** Customers per minute at rep 3, per stage, before director pacing and rush modifiers. */
    perMinute: { cart: 5.2, tinyShop: 7.8 } as Record<string, number>,
    /** Min seconds between spawns (keeps them from clumping). */
    minGapSec: 2.2,
    /** Max customers alive per shop (queue + walking), per stage. */
    maxAlive: { cart: 6, tinyShop: 12 } as Record<string, number>,
    /** Chance an arrival brings a buddy (1-2 at a time). */
    buddyChance: 0.25,
    /** Chance a served customer sits to sip (shop only, if seats are free). */
    sitChance: 0.55,
    sipSec: [6, 12] as [number, number],
  },

  queue: {
    /** Base queue capacity per stage; Extra queue spot adds more. */
    capacity: { cart: 4, tinyShop: 5 } as Record<string, number>,
  },

  carry: {
    base: 1,
    /** The carry ladder. Upgrades set these values. */
    ladder: [1, 2, 3, 5, 8, 12],
  },

  stock: {
    /** Pearl pot servings (Bigger pearl pot raises it). The tutorial starts it partly used. */
    pearlsMax: 6,
    pearlsMaxBig: 12,
    pearlsStart: 4,
    poppingMax: 8,
    jellyMax: 10,
    taroMax: 8,
    /** Tea urn: servings per brew, and brew seconds when empty. */
    teaUrnMax: 5,
    teaBrewSec: 3.2,
    /** Pearl auto-refill: seconds to refill when empty. */
    autoRefillSec: 2.5,
  },

  /** Upgrade costs and the stat thresholds that make their problem "visible". */
  upgrades: {
    carryTray: { cost: 14 },
    carry3: { cost: 45, showFullHands: 3 },
    fasterPour: { cost: 35, showWaitSec: 14 },
    fasterSealer: { cost: 35, showWaitSec: 12 },
    biggerPearlPot: { cost: 30, showEmptyHits: 2 },
    bench: { cost: 40, showAngry: 4 },
    tinyShop: { cost: 395 },
    carry5: { cost: 110, showFullHands: 3 },
    carry8: { cost: 220, showFullHands: 4 },
    carry12: { cost: 400, showFullHands: 5 },
    secondTea: { cost: 140, showBrewWaitSec: 6 },
    pearlAutoRefill: { cost: 160, showEmptyHits: 2 },
    fasterShoes: { cost: 120, showWalkMeters: 900 },
    seating: { cost: 150, showAngry: 4 },
    extraQueue: { cost: 90, showBalks: 2 },
    /** Multipliers applied by upgrades. */
    fasterPourMult: 0.55,
    fasterSealerRelease: 0.18,
    fasterShoesMult: 1.2,
    extraQueueSpots: 2,
    /** Pad coin drain: seconds to fill a pad from empty (0.8-1s). */
    padFillSec: 0.9,
  } as Record<string, any>,

  combo: {
    /** Timer (s), refilled on each serve; PERFECT adds bonus. Paused while shaking/sealing. */
    timerSec: 8,
    perfectBonusSec: 1.5,
    /** Multipliers by tier (tier 0 = no combo). */
    mults: [1, 2, 3, 5, 10],
    /** Serve counts that reach tier 1..n, per table. Tune against real rush drink times. */
    tables: {
      practice: [2, 4, 6],
      cart: [2, 4, 7, 12],
      tinyShop: [3, 6, 10, 15],
    } as Record<string, number[]>,
  },

  rush: {
    warningSec: 4,
    practiceSec: 22,
    randomSec: [30, 45] as [number, number],
    /** Everything speeds up. */
    speedMult: 1.5,
    playerSpeedMult: 1.35,
    patienceDrainMult: 1.6,
    brewSpeedMult: 1.5,
    spawnMult: 2.4,
    /** Crowd that bunches up outside during the warning. */
    crowdSize: 5,
    /** Random rushes: min gap after the last event (s), then chance per second rises. */
    minGapSec: 70,
    baseChancePerSec: 0.004,
    chanceRampPerSec: 0.0004,
    /** Bonus coins per serve paid when the results card is claimed. */
    claimBonusPerServe: 2,
    /** Practice rush: gentler patience so walkouts are unlikely. */
    practicePatienceDrainMult: 1.1,
    practicePatienceMult: 1.3,
  },

  events: {
    /** No random event can fire within this many seconds after a scripted beat, modal or reveal. */
    lockCooldown: 20,
  },

  /** Onboarding director soft pacing (game seconds). Beats also wait on player progress. */
  director: {
    impatientAfterServes: 1,
    milkTeaAtServes: 2,
    scriptedWalkoutAtServes: 4,
    scriptedWalkoutMinSec: 70,
    carryTrayAfterWalkoutSec: 4,
    practiceRushMinSec: 200,
    practiceRushAtServes: 16,
    secondToppingMinSec: 330,
    goalMinSec: 440,
    /** Early traffic is gentle: customers per minute during the first beats. */
    earlyPerMinute: 3.6,
    earlyMaxAlive: 2,
    /** Seconds without a customer before the director nudges one in. */
    idleNudgeSec: 5,
  },

  menu: {
    /** Recipe weights when a customer picks an order (only recipes on the menu). */
    weights: {
      pearlTea: 1,
      pearlMilkTea: 1.1,
      berryPopMilkTea: 0.9,
      icedJellyTea: 1,
      taroPearlMilk: 0.9,
      rainbowTaroSlush: 0.8,
    } as Record<string, number>,
  },
};

export type Balance = typeof balance;
applyUrlOverrides('balance', balance);
