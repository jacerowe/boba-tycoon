# Decisions

One line per call. Where the brief was silent, I picked whatever makes the game more fun, readable and fast.

## Input and controls
- Input: four methods, all live at once: a floating joystick (appears where the thumb lands), tap-to-move, WASD/arrows and click-to-move (a mouse drag works as a joystick too).
- Normal mode: tap the ground to walk there (clears the queue); tap a station to add it to the route queue, tap again to remove it; any joystick drag or WASD clears the route.
- Queued routes render as a dotted path with numbered pips on the stations.
- Shake mode: all pointer motion feeds the shake (desktop mouse doesn't need a button held); the joystick is off. Alternating ←/→ (or A/D) key presses also count as reversals, for keyboard players.
- Seal mode: seals on pointer *down* (not up) so CHUNK! lands the instant your finger does. Space/Enter also seal. WASD during seal walks away and cancels the seal (the drink stays unsealed).
- Opening: a "Tap to start" screen that also unlocks audio (resume() + silent buffer on the first touchend/click/keydown).

## Stations and recipes
- Station steps plant the player briefly (0.3–0.6s) instead of letting them slide past mid-step: it reads better and every step gets its motion + particle + sound + word. Routes continue right after.
- "Passes" a station: the trigger radius (0.62m) is generous when you're just walking past; when the station is your route target it waits until you're close (so you plant at the right spot).
- Finishing a step at a station you had queued later removes it from the queue (no pointless walk back).
- Ingredient refill: the refill spot *is* the pot. Stand at an empty pot and it refills over ~1s (cooking animation); linger at a low pot to top it up. Simpler than a separate sack spot.
- Tea machine brews in batches (5 servings, then ~3s of brewing). Waiting at a brewing urn is the visible problem the "Second tea machine" fixes.
- The drink in progress claims the oldest unfilled order at cup-grab time (recipe locks then). If that customer walks out, the drink is re-assigned to the next customer who ordered the same recipe; otherwise it becomes an extra you can bin for free (or serve to a later matching order).
- Capacity counts every cup you hold: the one being made plus finished ones. Carry 1 means make one, serve one.
- Serving hands each stacked cup to any queued customer whose order matches (claimed customer first), not only the one at the front.
- A "not yet" bonk only fires when you *enter* a station's radius, with a 1.2s cooldown per station, so it never nags.

## The shake
- The 1.6s window starts at the first reversal (not at mode entry), so a slow starter isn't punished. With no movement it resolves OK after 1.1s of grace. The whole beat stays ~2s.
- PERFECT needs ≥8 reversals *and* ≥70% of intervals within ±35% of the target tempo (5/s). Frantic off-tempo shaking caps at GREAT. `perfectOnTempoFraction` is in feel.ts.
- The first-ever shake uses generous thresholds (GREAT at 2 reversals, PERFECT at 7 with ±50% tempo) and a ghost-hand swipe.
- The sim never waits forever: if no ShakeResult arrives within window + grace + 1.5s, it resolves OK.
- Shake hero moment: camera pushes to 55%, the cup is lifted up and scaled 1.35×, the ticket hides, background vignettes.

## Tiers look different on the cup
- OK: plain cup, plain film lid.
- GREAT: a thick foam band + foam dome, pink-tinted film lid.
- PERFECT: foam + a pulsing gold rim glow on the shell, a gold film lid (the lid is what the top-down camera sees most), and a sparkle swirl orbiting the cup until it's served.

## Customers, patience, reputation
- Patience drains only once a customer has joined the line and ordered. Seated customers (bench/seating) drain at 0.6×.
- Before the scripted walkout lesson, customers can get angry but never walk out (they stop just above the furious line). "The first walkout that costs anything can only come after this beat."
- The scripted walkout costs 0 reputation but still plays the −rep pop.
- A full line makes new arrivals walk past ("balk") with a sad face: no rep loss, but it's the visible problem Extra queue spot solves.
- Served customers carry their drink away; in the shop they may sit at a table to sip before leaving.

## Combo and rush
- The combo timer runs out → the combo drops one tier quietly (soft fade, no shatter, no desaturation, no buzz) and the timer restarts.
- A walkout during a rush is the full COMBO BROKEN: cartoon crack sound, a "boing", a quick wobble, big pink words. Short and funny.
- The combo multiplier applies to tips, plus 30% of the price per tier step (`comboPriceShare`); there is no XP system in V1, so "XP" isn't boosted.
- The practice rush uses gentler patience drain (1.1× instead of 1.6×) and 1.3× crowd patience so walkouts are unlikely while learning.
- The rush results card pauses the sim while it's up; claiming pays a small bonus (2 coins per serve). Reloading with an unclaimed card pays it out automatically.
- Rush "world time scale 1.5×, player 1.35×, patience 1.6×" are implemented as sim modifiers (a shared modifier stack) that ease in over 0.35s; the *global* timeScale is reserved for hit-stop, the rush-end slow-mo wind-down and debug.
- During the warning the crowd bunches up outside; when the rush starts they pour into the line as spots free.

## Upgrades
- Carry 3 appears when your hands are full while orders are still waiting (3 times), not only on bonks, so good players see it too.
- Upgrade pads keep partial payments when you step off (the drain stops instantly, the progress stays).
- Cart upgrades you skipped stay available in the shop. The Bench is cart-only; in the shop, Seating adds a bench along the queue rope.

## Progression and pacing
- The goal (Tiny Shop) pad appears at the goal beat (≥7:20 game time). Shop price tuned to 395 so the competent bot lands at 8.1–9.0 game-minutes and the casual bot at 13.4–14.2 (see `tests/botpace.test.ts`).
- Post-shop unlocks: Rainbow Jelly (+ ice recipe) 15s after the reveal, Taro at +150s, Rainbow Taro Slush at +300s. Each is offered with the menu card.
- Menu choice: new recipes are offered on a card (icons: "pays more", "takes longer"). The menu board station (appears with the second topping) reopens the choice; at least one drink always stays on the menu.

## Look and feel
- Palette: warm peach/pink plaza tiles; every station gets its own body color so kids can tell them apart at a glance; plum outlines instead of black.
- Outlines: inverted hull (works with instancing). Shadows: blob shadows, no shadow maps.
- Drinks, customers, coins and particles are all instanced; the whole crowd is ~16 draw calls, all cups ~10.
- The umbrella sits on the right of the cart so it never hides the line (which snakes up-left).
- Customer order bubbles show a real mini render of the drink (same cup renderer, rendered once per recipe/tier).

## Tech
- Preview port 4391 for Playwright and 5287 for the dev server (other local apps already used 4173/5199).
- Git identity is repo-local and uses Jace's GitHub noreply address so the public repo doesn't expose a personal email.
