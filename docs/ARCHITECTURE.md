# Architecture

Boba Tycoon is TypeScript (strict) + Vite + Three.js, no game engine. Everything you see is procedural: primitives, lathe cups, canvas-drawn faces and icons, synthesized audio.

```
src/
  config/   feel.ts (timings, juice, camera) · balance.ts (economy, spawns, patience, combos) · style.ts (every color) · overrides.ts (?balance.x.y=… URL overrides)
  data/     typed game data, validated at startup: ingredients, recipes, stations, stages, upgrades, events, districts, beats, registry.ts (+ validate)
  sim/      the pure simulation (no Three.js, no DOM — enforced by eslint + tests/data.test.ts)
  view/     Three.js scene: world, stations, player, instanced characters/cups/particles/coins, camera, juice, reveal
  input/    pointer/keyboard → commands only (joystick, taps, WASD, shake tracker)
  audio/    WebAudio synth engine, sfx, procedural music
  ui/       DOM overlay (HUD, bubbles, words, modals), icons, haptics, dev panel, strings (every UI string)
  save/     localStorage save/load, migrations
  debug/    window.__boba test hook
  game.ts   the loop: fixed-step sim + interpolated render + global timeScale (hit-stop, slow-mo)
```

## The loop

`Game.step()` runs every animation frame:

1. `input.update()` turns pointer/keyboard state into **commands** (`MoveVector`, `MoveTo`, `ToggleStation`, `ShakeResult`, `Seal`, …).
2. Real time × `timeScale` accumulates; the sim ticks at a fixed 60 Hz (`SIM_DT`). Hit-stop sets `timeScale` to 0 for 40–80 ms; the rush wind-down eases it from 0.35 → 1. The UI always runs on real time.
3. Each tick returns typed **events** (`DrinkSealed`, `CustomerServed`, `ComboChanged`, `RushWarning`, `Walkout`, …). The view, audio and UI react to events; they never mutate the sim.
4. `view.frame()` interpolates positions between the last two ticks and renders.

## The sim

`Sim` owns a plain-data `SimState` (JSON-serializable: it's hashed, saved, replayed). Systems are modules that operate on it: `customers.ts`, `gameEvents.ts` (rush + combo + modifier stack), `upgrades.ts` (pads), `director.ts` (onboarding), `nav.ts`, `shake.ts` (the pure classifier). The RNG is seeded mulberry32 with its state inside `SimState`.

Bots (`sim/bot.ts`) are sim-level: they read state and enqueue the same commands a player would. Vitest runs them fast-forwarded; the e2e runs them inside the rendered game.

## Seams for the future (built, not used yet)

| Future feature | Seam in V1 |
|---|---|
| **Multiple shops**, "shop needs help" jumps | `WorldState.shops: ShopState[]` + `activeShopId`. Each shop owns its stage/layout, stations (with stock), menu, upgrades, pads, reputation and stats (lifetime + per-stage). Everything the sim touches goes through `sim.shop`, so switching the active shop is one id. Inactive shops can later tick in a cheap simulated mode (income from average serve rate × reputation). |
| **Districts** (suburbs, downtown, beach, mall, night, airport) | The spawner reads a `DemandProfile` (`data/districts.ts`): recipe weights, patience multiplier, tip multiplier and a traffic curve over time. V1 ships "Starter Street". `WorldState.districtId` picks it. |
| **Café and Flagship** | Stages are data (`data/stages.ts`): walk bounds, camera focus, station slots (with `requires` on upgrades/ingredients/beats), queue spots, bench spots, sip seats, spawn/entry points, pad slots, goal pad slot, crowd spots, combo table, `next` stage and a `buildHook` the view plays (V1: `revealTinyShop`). Camera distance/frame per stage live in `feel.camera`. A new stage is a new entry plus an upgrade with `effect: { kind: 'stage' }`. |
| **Create-a-Boba** (custom named drinks that can trend) | Recipes are data: `{ id, name, steps[], origin: 'builtin' \| 'player', popularity, straw, price? }`. `Registry.addRecipe()` validates and registers runtime recipes; `popularity` already multiplies order weights. The drink renderer derives the whole look from the ingredient list, so any valid combo renders. |
| **Events** (Boba Mania, Flavor Craze, VIP, Tour Bus, Viral) | The Drink Rush is the first generic timed `GameEventDef` (`data/events.ts`): warning seconds, duration range, modifiers, combo table, trigger (`scripted` or `random` with min gap + rising chance), results card, crowd size/recipe, patience and claim bonus. Modifiers go through one stack (`gameEvents.targetMods`), so a second concurrent source just multiplies in. `tests/data.test.ts` defines "Boba Mania" in data alone and runs it. |
| **Friend Worlds** multiplayer | Fixed-step sim separate from rendering, seeded RNG, and all input as **commands** (`sim/commands.ts`). `tests/sim.test.ts` records a bot's command log and replays it twice to identical state hashes (same-build determinism only). `SimState.profile` (brand, lifetime stats) is separate from the resettable `world`. Money lives in `world.wallets[walletId]`; each shop points at a wallet. Customers belong to the world and target a shop. Networking and cross-device float determinism are out of scope. |
| **Managers / employees** | The player is a `WorkerState` (`isPlayer: true`) with a task, route, held drink, stack and capacity; `world.workers[]` is reserved for employees. `maxQualityForActor()` caps non-players below PERFECT (unit-tested). |

## Rendering budget

- Customers (and pedestrians) are one `CharacterRenderer`: instanced body/head/face-atlas/hair/hats/feet/arms/shadow — ~16 draw calls for any crowd.
- Cups are one `CupRenderer`: instanced liquid (custom shader: fill, layers, milk swirl, foam, slosh tilt), glossy shell, rim/hull outline, lid, straw, foam dome, and two instanced topping meshes — ~10 draw calls for every cup on screen. Order-bubble drink images are rendered once per recipe/tier with the same renderer (`DrinkIcons`).
- Particles: one instanced billboard system with a procedural atlas. Coins: one instanced mesh (+ outline).
- Static props are merged per prop with vertex colors (`MeshBuilder`); flat ground decals skip outlines; the Tiny Shop is baked into two static meshes after its reveal.
- Busiest scene (20+ customers, rush, 12-cup stack) is gated in CI at ≤120 draw calls / ≤150k triangles / ≤24 textures.

## Save

`localStorage['bobaTycoon.save.v1']` = `{ schemaVersion, savedAt, profile, worlds, activeWorldId }` with a migration array (`save/save.ts`). Transient state (customers, drinks in hand, an active rush) is dropped; an unclaimed rush bonus is paid out; a save made mid-reveal lands in the finished shop. Every storage access is wrapped; corrupt or missing saves start a new game.
