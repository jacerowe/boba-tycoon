# Playtest notes

Honest notes from automated runs, screenshot reviews and my own play in the browser. Whether it *feels good to make boba* is Jace's call on a real phone.

## How I tested

- Sim bots (Vitest, fast-forwarded): competent reaches the Tiny Shop in 8.3–9.2 game-minutes, casual in 14.1–14.6; first serve ≈15 s; practice rush reaches x3 with carry 2 on every seed tested.
- Rendered e2e on Chromium phone (390×844): a fresh save driven by the competent bot at 8× reaches the Tiny Shop at ~8.3 game-minutes with every beat in order and no console errors. A 2 s filmstrip of that run is in `docs/screenshots/filmstrip/fullrun.png`.
- Screenshots of every key moment are in `docs/screenshots/`.

## What works

- **The drink loop reads instantly.** Color-coded stations, a glowing/bobbing next station, a step ticket under the player, and a ghost hand that taps the first station until you move.
- **Drinks look like the star.** Layered liquids, visible pearls/popping/jelly/ice, fat straws; tiers are obvious from the top-down camera because the lid itself changes (white / pink / gold) and PERFECT cups carry a sparkle swirl.
- **The rush is loud in a good way.** Countdown, slam, saturation, pulsing border, speed lines, combo meter that grows with each tier; the results card makes rushes feel like a reward.
- **The Tiny Shop reveal lands.** Tiles ripple out, walls thunk up, the awning drops, the sign swings in, and the camera pulls back over the street to the FOR SALE sign across the road.

## Rough edges (known)

- **Frame rate is unmeasured on real phones.** CI uses software WebGL (~15 fps headless); the draw-call and triangle budgets hold, but only Jace's phone with `?debug=1` can say how it feels.
- **The shake is tuned on synthetic traces.** Thresholds (4 / 8 reversals, ±35% tempo) are a guess at human thumbs; real swipes may want a longer window or a looser tempo. Try `?feel.shake.windowSec=2` if PERFECT feels impossible.
- **Early game can drag for a very slow player.** Before the walkout lesson customers never leave, which is kind, but the line can look stuck.
- **Drink colors lean amber/caramel** until taro and jelly arrive after the shop.
- **Audio is synthesized** and untested on iOS hardware (the silent switch mutes Web Audio).
- **Headless e2e timing is fragile**: steering tests step the sim clock by hand because slow software rendering delays input events.
