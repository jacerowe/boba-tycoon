// Feel: timings, juice and camera. Every number is a starting value; tune freely.
// Documented in docs/TUNING.md. Override from the URL: ?feel.shake.windowSec=1.8
import { applyUrlOverrides } from './overrides';

export const feel = {
  sim: {
    /** Fixed simulation rate (Hz). */
    hz: 60,
    /** Max real seconds simulated per frame (prevents spiral of death after a tab stall). */
    maxFrameSec: 0.1,
  },

  move: {
    /** Player top speed in m/s. */
    speed: 5.4,
    /** Seconds to reach full speed from rest (snappy, never icy). */
    accelSec: 0.09,
    /** Seconds to stop from full speed. */
    decelSec: 0.07,
    /** Distance at which a route target counts as reached (m). */
    arriveDist: 0.18,
    /** Player collision radius (m). */
    radius: 0.32,
    /** Station trigger radius around a service point (m). */
    stationTriggerRadius: 0.62,
    /** Upgrade pad trigger radius (m). */
    padRadius: 0.7,
    /** Extra clearance routes keep around pads they are not heading to (m). */
    padAvoidMargin: 0.35,
    /** Waddle-hop: bob height (m) and steps per metre. */
    hopHeight: 0.09,
    hopPerMeter: 1.55,
    /** Lean into turns (radians per rad/s of turn rate), clamped. */
    leanPerTurn: 0.05,
    leanMax: 0.28,
    /** Forward lean at speed (radians). */
    forwardLean: 0.12,
    /** Turn speed (radians/sec) for facing. */
    turnRate: 16,
    /** Dust puff every N metres walked. */
    dustEvery: 0.9,
    /** Arrival "plant" squash amount. */
    plantSquash: 0.16,
    /** Speed lines appear above this speed during a rush (m/s). */
    speedLinesMin: 3.5,
  },

  steps: {
    /** Seconds per auto step (0.3-0.6s). Upgrades multiply these. */
    cup: 0.3,
    tea: 0.55,
    milk: 0.4,
    pearls: 0.45,
    popping: 0.45,
    ice: 0.35,
    jelly: 0.4,
    taro: 0.45,
    /** Seconds after CHUNK before the sealed cup lifts free. */
    sealRelease: 0.5,
    /** Seconds to refill a pot while standing at its refill spot. */
    refill: 1.0,
    /** Seconds between cup handoffs at the counter. */
    serveGap: 0.14,
    /** Seconds a "not yet" bonk suppresses repeat bonks at the same station. */
    bonkCooldown: 1.2,
    /** Seconds before a stuck seal prompt shows the ghost hand. */
    sealHintAfter: 1.4,
  },

  shake: {
    /** Scoring window (seconds), measured from the first reversal. */
    windowSec: 1.6,
    /** If the player never moves, the shake resolves OK after this grace (seconds). */
    idleGraceSec: 1.5,
    /** Minimum pointer travel along the dominant axis before a direction change counts (CSS px). */
    minTravelPx: 18,
    /** Target tempo shown by the breathing ring (reversals per second). */
    targetRate: 5,
    /** Interval tolerance around the target tempo (±fraction) for PERFECT. */
    tempoTolerance: 0.35,
    /** Fraction of intervals that must be on tempo for PERFECT. */
    perfectOnTempoFraction: 0.7,
    /** Reversal thresholds. OK below greatAt; GREAT greatAt..perfectAt-1; PERFECT >= perfectAt and on tempo. */
    greatAt: 4,
    perfectAt: 8,
    /** First-ever shake is tuned generously toward GREAT. */
    generousGreatAt: 2,
    generousPerfectAt: 7,
    generousTolerance: 0.5,
    /** Keyboard: alternating ←/→ or A/D presses count as reversals. */
    keyTravelPx: 40,
    /** Spring lag of the shaker following the pointer. */
    followStiffness: 260,
    followDamping: 18,
    /** Max visual throw of the shaker (m). */
    maxThrow: 0.42,
    /** Safety: the sim resolves OK if no result arrives within window + this (seconds). */
    simTimeoutPad: 1.5,
  },

  camera: {
    /** Vertical FOV in degrees. */
    fov: 40,
    /** Pitch: angle below horizontal (degrees). Tilted top-down, never first person. */
    pitchDeg: 54,
    /** Camera distance per stage (m). Grows as the shop grows. */
    distance: { cart: 12, tinyShop: 17 } as Record<string, number>,
    /** Keep this many metres of world visible across the narrow axis per stage. */
    frameWidth: { cart: 7.1, tinyShop: 9.8 } as Record<string, number>,
    /** Landscape: metres of ground depth to keep visible vertically. */
    frameDepth: { cart: 10.5, tinyShop: 14 } as Record<string, number>,
    /** Follow spring (critically damped-ish). */
    followStiffness: 40,
    followDamping: 12,
    /** How far the camera may drift from the stage centre toward the player (0..1). */
    followWeight: { cart: 0.6, tinyShop: 0.8 } as Record<string, number>,
    /** Look-ahead toward the player's velocity (seconds). */
    lookAhead: 0.12,
    /** Shake hero moment: push to this fraction of distance over pushInSec. */
    shakePushIn: 0.5,
    pushInSec: 0.25,
    pushOutSec: 0.45,
    /** Furthest world z (the back of the lot) the bottom screen edge may show; stops the follow drifting onto empty grass. */
    backLimitZ: { cart: 8.4, tinyShop: 8.2 } as Record<string, number>,
    /** Portrait screens get a wider framing rule so the cart stays in view. */
    portraitDistanceBoost: 1.0,
    /** Zoom easing between stages (seconds). */
    stageZoomSec: 1.6,
  },

  juice: {
    /** Screen shake: offset = trauma² × maxOffset, noise-driven, decays per second. */
    traumaDecay: 1.6,
    maxShakeOffset: 0.45,
    maxShakeRollDeg: 2.2,
    shakeNoiseHz: 22,
    trauma: { small: 0.1, perfect: 0.25, rushStart: 0.5, purchase: 0.6, seal: 0.14, walkout: 0.12, tierUp: 0.2 },
    /** Hit-stop durations (ms): freezes sim time, never the UI. */
    hitStop: { seal: 55, perfect: 80, tierUp: 60, comboBroken: 70, purchase: 50 },
    squashAmount: 0.18,
    squashMs: 140,
    /** Damped spring defaults for stacks, pop-ins and stations. */
    springStiffness: 180,
    springDamping: 11,
    /** Floating words: scale 0 → 1.25 → 1 over popMs with ±rotDeg, then drift and fade. */
    wordPopMs: 180,
    wordRotDeg: 8,
    wordLifeMs: 900,
    wordRisePx: 46,
    /** Reduced motion scales shake and flashes to this fraction. */
    reducedMotionScale: 0.2,
  },

  /** Photosensitivity: hard limits. No full-screen/large-area flash faster than 3 Hz. */
  flash: {
    maxHz: 3,
    /** Max alpha of the rush edge frame / tier-up edge flash. */
    edgeFlashMaxAlpha: 0.32,
    /** Rush warning flicker: low-contrast brightness dip. */
    warningFlickerHz: 1.5,
    warningFlickerDepth: 0.08,
    /** Rush border pulse rate (Hz) — well under maxHz. */
    rushPulseHz: 1.2,
    rushBorderAlpha: 0.28,
    tierUpFlashMs: 260,
  },

  stack: {
    /** Cups per tower layer, their scale, and the side-by-side gap (m). */
    perLayer: 2,
    cupScale: 0.8,
    layerGap: 0.33,
    /** Spring linking tower layers; sway grows toward the top. */
    stiffness: 70,
    damping: 7.5,
    /** How strongly player acceleration pushes the stack. */
    accelInfluence: 0.006,
    /** Max lean per layer, and for the whole tower (radians): barely stable, never falls. */
    maxLean: 0.07,
    maxTotalLean: 0.5,
    /** Sweat drop appears at this many cups during a rush. */
    sweatAt: 8,
    /** Handoff arc duration (s) and height (m). */
    handoffSec: 0.32,
    handoffArc: 1.3,
  },

  customers: {
    walkSpeed: 2.3,
    walkoutSpeed: 3.6,
    hopHeight: 0.07,
    /** Coins burst on a serve: count range, scaled with payout. */
    coinsMin: 3,
    coinsMax: 12,
    coinFlightSec: 0.55,
    coinMagnetSec: 0.35,
    bubbleScale: 1,
  },

  particles: {
    max: 900,
    coinsMax: 160,
  },

  rush: {
    /** Slow-motion wind-down at the end of a rush (ms) and its time scale. */
    windDownMs: 600,
    windDownScale: 0.35,
    speedLineCount: 14,
  },

  reveal: {
    /** Total reveal ~7s; skippable after skipAfterSec. */
    skipAfterSec: 2,
    coinsPourSec: 0.9,
    tilesSec: 0.9,
    wallsSec: 1.3,
    roofSec: 0.8,
    stationsSec: 0.9,
    pullBackSec: 2.5,
    holdSec: 0.9,
    easeInSec: 1.2,
  },

  haptics: {
    tick: 8,
    seal: [18],
    perfect: [20, 40, 20, 40, 45],
    purchase: [30, 30, 30],
    tierUp: [15, 25, 30],
  },

  audio: {
    masterGain: 0.8,
    musicGain: 0.32,
    sfxGain: 0.9,
    pitchVariance: 0.05,
    /** Coin ladder: notes climb if coins land within this many ms of each other. */
    coinLadderMs: 260,
    musicBpm: 104,
    rushBpm: 138,
    crossfadeSec: 0.6,
  },

  ui: {
    buttonPressScale: 0.92,
    buttonReleaseOvershoot: 1.06,
    /** Tap vs drag threshold (CSS px). */
    tapSlopPx: 12,
    /** Joystick radius (CSS px). */
    joystickRadius: 56,
    joystickDeadzone: 0.14,
    moneyTickMs: 450,
  },

  perf: {
    /** Lower DPR when the average frame time exceeds this (ms). */
    dprDownAtMs: 24,
    dprUpAtMs: 14,
    dprMin: 1,
    dprMax: 2,
  },
};

export type Feel = typeof feel;
applyUrlOverrides('feel', feel);
