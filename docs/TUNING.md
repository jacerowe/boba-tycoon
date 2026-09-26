# Tuning

Every number lives in one of three files. Numbers are starting values: change them freely.

- `src/config/balance.ts`: economy, prices, reputation, patience, traffic, queue, carry, stock, upgrade costs and triggers, combos, rush, events, onboarding pacing, menu weights.
- `src/config/feel.ts`: movement, step timings, the shake, the camera, juice (trauma, hit-stop, squash, words), photosensitivity limits, the stack, customers, particles, reveal timings, haptics, audio, UI, performance.
- `src/config/style.ts`: every color.

## Changing values without rebuilding

- **URL overrides:** any dotted path works, e.g.
  `?balance.rush.speedMult=1.8`, `?feel.shake.windowSec=2`, `?balance.upgrades.tinyShop.cost=200`, `?feel.camera.pitchDeg=60`.
  Unknown or mistyped keys log a warning and are ignored. Combine them with `&`.
- **Dev panel:** press `~` (desktop) or tap with three fingers (phone). It has live sliders for the most-tuned knobs, time scale (0.25–8×), trigger rush, +$100/+$1000, spawn 5, a 12-cup stack, 5★ reputation, skip to any beat, bot on/off, an FPS/draw-call overlay and reset save.
- **Dev flags:** `?debug=1` (FPS overlay + `window.__boba`), `?seed=N`, `?beat=N` or `?beat=goal`, `?skipTutorial=1`, `?nosave=1`, `?autostart=1`, `?lineup=1` (10-drink hero shot).

## The knobs that matter most

| Knob | Default | What it does |
|---|---|---|
| `balance.upgrades.tinyShop.cost` | 375 | How long the cart phase lasts. Bots: competent 8.1–9.0 min, casual 13.6–14.3 min. |
| `balance.patience.baseSec` | cart 40, shop 52 | Seconds before a waiting customer walks out. Lower = more pressure and walkouts. |
| `balance.traffic.perMinute.cart` | 5.2 | Customers per minute at 3★ (reputation scales it 0.55×–1.6×). |
| `balance.rush.speedMult` | 1.5 | World speed during a rush (customers, brewing, spawns, steps). Player uses `playerSpeedMult` 1.35, patience `patienceDrainMult` 1.4. |
| `balance.combo.timerSec` | 8 | Combo timer; each serve refills it, PERFECT adds `perfectBonusSec`. |
| `balance.combo.tables` | practice 2/4/6, cart 2/4/7/12, shop 2/4/6/8 | Serves that reach x2/x3/x5/x10. |
| `balance.rush.minGapSec` / `baseChancePerSec` / `chanceRampPerSec` | 70 / 0.004 / 0.0004 | How often random rushes happen once eligible. |
| `feel.shake.windowSec` | 1.6 | Scoring window from the first reversal. |
| `feel.shake.greatAt` / `perfectAt` | 4 / 8 | Reversals for GREAT and PERFECT. PERFECT also needs 70% of intervals within ±35% of 5 reversals/s. |
| `feel.shake.idleGraceSec` | 1.5 | Seconds to start shaking before it resolves OK on its own. |
| `feel.move.speed` | 5.4 | Player top speed (m/s). `accelSec` 0.09 / `decelSec` 0.07 keep it snappy. |
| `feel.camera.frameWidth` | cart 7.1, shop 9.8 | Metres visible across a portrait screen. |
| `feel.camera.frameDepth` | cart 13, shop 16 | Metres of ground depth visible on a landscape screen; `landscapeFocusZ` (cart −0.9, shop −0.6) leans the frame toward the queue. |
| `feel.camera.backLimitZ` | cart 8.4, shop 8.2 | Furthest world z the bottom screen edge may show. Lower it to push the view further toward the street. |
| `feel.juice.hitStop` | 50–80 ms | Freeze frames on seal, PERFECT, combo tier-up, COMBO BROKEN, purchase. |
| `feel.juice.trauma` | 0.1–0.6 | Screen shake per event (shake = trauma²). |

## Pacing of the first 10 minutes (`balance.director`)

| Beat | Starts when |
|---|---|
| firstOrder | Tap to start. One tutorial customer (Pearl Tea, endless patience). |
| impatient | First serve. Pearl Milk Tea joins at 2 serves. |
| scriptedWalkout | ≥4 serves and ≥70 s. A customer at the back huffs off (no rep cost). |
| carryTray | 4 s after the walkout lesson. The tray pad appears (14 coins); a second customer is nudged in. |
| practiceRush | Tray owned, ≥200 s and ≥16 serves (or ≥290 s regardless). 28 s rush, crowd lines up early. |
| bottlenecks | Practice rush claimed. Random rushes on; bottleneck pads appear as their problems show. |
| secondTopping | ≥330 s. Popping boba unlocks, menu card offers Berry Pop Milk Tea, menu board appears. |
| goal | ≥480 s. Tiny Shop pad (375) + goal bar + ghost outline. |
| reveal / shop | Tiny Shop bought. Jelly + ice recipe at +15 s, taro at +150 s, Rainbow Taro Slush at +300 s. |

## Upgrade triggers (a pad appears only when its problem is visible)

| Upgrade | Cost | Appears when |
|---|---|---|
| Carry tray | 14 | carryTray beat |
| Carry 3 | 45 | hands full while orders wait ×3 (after bottlenecks) |
| Faster pour | 35 | ≥14 s spent pouring tea/milk |
| Faster sealer | 35 | ≥12 s spent waiting for the sealer |
| Bigger pearl pot | 30 | pearl pot found empty ×2 |
| Bench | 40 | 4 customers got angry |
| Tiny Boba Shop | 375 | goal beat |
| Carry 5 / 8 / 12 | 110 / 220 / 400 | hands full ×3/4/5 in the shop (chain) |
| Second tea machine | 140 | ≥6 s waiting for tea to brew in the shop |
| Pearl auto-refill | 160 | pearl pot empty ×2 in the shop |
| Faster shoes | 120 | 900 m walked in the shop |
| Seating | 150 | 4 angry customers in the shop |
| Extra queue spot | 90 | 2 customers walked past a full line |

## Photosensitivity (hard limits, `feel.flash`)

`maxHz` 3 (nothing flashes faster), edge flash alpha ≤0.32, rush border pulse 1.2 Hz at alpha ≤0.28, warning flicker 1.5 Hz at 8% depth. Reduced motion scales shake and flashes to 20% (`feel.juice.reducedMotionScale`).
