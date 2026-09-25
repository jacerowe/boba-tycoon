// Typed events the sim emits each tick. The view, audio and UI react to these.
import type { Quality, Vec2 } from '../data/types';
import type { EventResults } from './types';

export type BonkReason = 'notYet' | 'handsFull' | 'noOrders' | 'empty' | 'noMatch';

export type SimEvent =
  | { type: 'GameStarted' }
  | { type: 'BeatChanged'; beat: string; prev: string }
  | { type: 'CupGrabbed'; stationId: string; drinkId: number; recipeId: string }
  | { type: 'StepStarted'; stationId: string; step: string; drinkId: number; dur: number }
  | { type: 'StepDone'; stationId: string; step: string; drinkId: number }
  | { type: 'StepNotYet'; stationId: string; reason: BonkReason }
  | { type: 'ShakeStarted'; stationId: string; drinkId: number; generous: boolean; maxQuality: Quality }
  | { type: 'ShakeResolved'; stationId: string; drinkId: number; quality: Quality; reversals: number; timedOut: boolean }
  | { type: 'SealReady'; stationId: string; drinkId: number }
  | { type: 'SealCancelled'; stationId: string; drinkId: number }
  | { type: 'DrinkSealed'; stationId: string; drinkId: number; quality: Quality }
  | { type: 'DrinkReady'; drinkId: number; stackSize: number }
  | { type: 'DrinkBinned'; drinkId: number }
  | { type: 'DrinkReassigned'; drinkId: number; customerId: number | null }
  | { type: 'RefillStarted'; stationId: string; dur: number }
  | { type: 'Refilled'; stationId: string; stock: number }
  | { type: 'StockLow'; stationId: string; stock: number }
  | { type: 'StockEmpty'; stationId: string }
  | { type: 'BrewStarted'; stationId: string; sec: number }
  | { type: 'BrewDone'; stationId: string }
  | { type: 'CustomerSpawned'; customerId: number; crowd: boolean }
  | { type: 'CustomerQueued'; customerId: number; recipeId: string }
  | { type: 'PatienceChanged'; customerId: number; mood: number; prev: number }
  | { type: 'CustomerServed'; customerId: number; drinkId: number; recipeId: string; quality: Quality; cash: number; tip: number; mult: number; from: Vec2 }
  | { type: 'CustomerLeft'; customerId: number }
  | { type: 'CustomerBalked'; customerId: number }
  | { type: 'CustomerSat'; customerId: number }
  | { type: 'Walkout'; customerId: number; scripted: boolean; repLoss: number }
  | { type: 'ReputationChanged'; value: number; delta: number }
  | { type: 'CashChanged'; cash: number; delta: number }
  | { type: 'PadAppeared'; upgradeId: string }
  | { type: 'PadProgress'; upgradeId: string; paid: number; cost: number }
  | { type: 'UpgradePurchased'; upgradeId: string }
  | { type: 'StageChanged'; from: string; to: string }
  | { type: 'RevealFinished'; stage: string }
  | { type: 'MenuChanged'; menu: string[] }
  | { type: 'IngredientUnlocked'; ingredientId: string }
  | { type: 'OfferMenu'; recipeId: string }
  | { type: 'MenuBoardOpened' }
  | { type: 'RushWarning'; eventId: string; warningSec: number; practice: boolean }
  | { type: 'RushStarted'; eventId: string; durationSec: number; practice: boolean }
  | { type: 'RushEnded'; eventId: string; results: EventResults }
  | { type: 'RewardClaimed'; cash: number }
  | { type: 'ComboChanged'; tier: number; mult: number; serves: number; kind: 'up' | 'timeout' | 'broken' | 'reset' | 'refill' }
  | { type: 'WalkoutLesson' }
  | { type: 'PatienceIntro' }
  | { type: 'Hint'; key: string };

export type SimEventType = SimEvent['type'];
