// Input becomes commands. The sim only changes through commands + ticks, so a recorded
// command log replays to the same state (same-build determinism).
import type { Quality } from '../data/types';

export type Command =
  | { type: 'StartGame' }
  /** Joystick / WASD vector (length ≤ 1). Any non-zero vector cancels the queued route. */
  | { type: 'MoveVector'; x: number; z: number }
  /** Tap the ground: walk there (replaces the route). */
  | { type: 'MoveTo'; x: number; z: number }
  /** Tap a station: add it to the route queue, or remove it if already queued. */
  | { type: 'ToggleStation'; stationId: string }
  /** Walk to a station (appends; used by bots and the test hook). */
  | { type: 'InteractStation'; stationId: string }
  | { type: 'ClearRoute' }
  | { type: 'ShakeResult'; quality: Quality; reversals: number }
  | { type: 'Seal' }
  /** Instant purchase if affordable (bots/tests). Players buy by standing on pads. */
  | { type: 'BuyUpgrade'; upgradeId: string }
  | { type: 'SetMenu'; recipeId: string; enabled: boolean }
  /** Answer the pending menu card. */
  | { type: 'AnswerOffer'; accept: boolean }
  | { type: 'ClaimReward' }
  | { type: 'RevealDone' }
  | { type: 'TriggerEvent'; eventId: string }
  | { type: 'DebugAddCash'; amount: number }
  | { type: 'DebugSkipTo'; beat: string }
  | { type: 'DebugSetRep'; value: number }
  | { type: 'DebugSpawn'; count: number }
  | { type: 'DebugGiveUpgrade'; upgradeId: string }
  | { type: 'DebugFillStack'; count: number };

export interface StampedCommand { tick: number; cmd: Command }
