# Signal Tower

A browser puzzle game: build radio towers so that every house in town gets signal.

**Play:** https://kcummins44.github.io/signal-tower/

Plain HTML, CSS and JavaScript with no build step and no runtime dependencies. All art is drawn with canvas and SVG code, and all sound is synthesized with WebAudio.

## Rules

- Drag a tower from the tray at the bottom onto a grass tile or a hill, or tap a tile to build the selected tower type.
- Each level gives you a fixed number of towers (and, on dish levels, dishes). The tray shows how many are left.
- A tower reaches every tile whose centre lies within its radius (2 tiles on most levels, 3 on levels 13 and 14, 1 on levels 24 and 25).
- **Walls** block signal.
- **Hills** block signal for towers on the ground. A tower built on a hill gets +1 range and sees over other hills.
- **Trees** can't hold towers, but signal passes through them.
- Line of sight runs from the centre of the tower's tile to the centre of each target tile. A line that only grazes a blocker's corner passes. A line squeezing between two blockers that touch diagonally is blocked.
- You win when every house is connected (and the level's other rules hold).

**38 levels in 7 chapters:**

| Chapter | Levels | New rule |
|---|---|---|
| 1. Main Street | 1 to 15 | The basics |
| 2. Quiet Hours | 16 to 19 | **Observatories** (`Q`) must stay out of every live tower's reach. They hold no tower and don't block signal, so walls, hills and panels are your shields. |
| 3. Rush Hour | 20 to 23 | **Office blocks** (`B`) need two different towers. Their two roof lamps show the count. |
| 4. Point the Dish | 24 to 27 | **Dishes** cover a 90 degree cone (edges count) out to radius + 2 (plus the hill bonus). A dish lands facing north; tap it to turn it clockwise. Turning is free. |
| 5. Relay Run | 28 to 31 | The **station** (`S`) is a fixed tower with the level radius. A placed tower only works (is live) if it links back to the station through other live towers. Dead towers light nothing. |
| 6. Hall of Mirrors | 32 to 35 | **Reflector panels** (`/` and `L`) block direct signal but bounce it once, round corners. |
| 7. Grand Broadcast | 36 to 38 | Mixed |

A chapter opens when the last level of the chapter before it is finished.

**Rules we had to choose** (Kaden's calls, plus a few details):
- Turning a dish never costs a move (Kaden).
- Relay links are two-way (Kaden): two towers link when **either** one covers the other's tile, so a hill tower that reaches the station is live even if the station can't reach it. The station links the same way.
- A bounce counts the **whole path** for range (Atlas's call). In practice: mirror the tower across the panel's slab line; a tile is lit by the bounce if the mirror point is within range of it, the path from the mirror point to the tile crosses the slab (not its last 5% at either end), the tile is on the tower's side of the slab, and both legs (tower to slab, slab to tile) have clear line of sight. One bounce only. Panels are two-sided. `/` runs from the tile's bottom-left corner to its top-right corner; `L` from top-left to bottom-right.
- A dish bounces only if the point where the signal hits the slab is inside its cone. A tower on a hill keeps its height on both legs of a bounce.
- Panels block every tower, even one on a hill, like walls.
- The station also lights houses and counts as one of the two towers an office block needs. Links (and relay links) use bounced coverage too: covered is covered.
- An observatory only cares about **live** towers. A dead tower near it is harmless.
- Long press on a tower (touch) removes it. Tap still removes a standard tower and turns a dish.

**Stars.** Each place, move, remove or undo counts as one move. Turning a dish (and undoing a turn) is free. The solver sets the thresholds for each level:

| Stars | Requirement |
|-------|-------------|
| 3 | Moves ≤ the towers in the smallest solution (a perfect run), with no hints |
| 2 | Moves ≤ that number + max(2, that number). Using a hint caps the level at 2 stars |
| 1 | Any solve |

You unlock the next level by finishing the current one. Stars, best move counts, seen onboarding tips and the sound setting are saved in `localStorage` (old saves keep working).

**Controls:**
- Tray: drag a tower or dish out onto the board. Drop it on the tray, off the board or on a blocked tile to cancel (no move). Tap a chip to choose which type a tile tap builds.
- Drag a placed tower to another tile to move it (1 move), or off the board / onto the tray to remove it (1 move). A dish keeps its facing when moved.
- Mouse: hover a tile to preview a tower's reach before you build. Hover a dish to see its cone and the next facing.
- Touch: the dragged tower floats above your finger so you can see where it lands. Hold an empty tile to lift a tower there and preview it; release to build. Hold a tower to remove it.
- Keyboard: arrow keys move the cursor, Enter builds (or removes a tower, or turns a dish), `1` / `2` pick Tower / Dish, `M` picks up the tower under the cursor (arrows move it, Enter drops, Esc cancels), `Delete` removes, `Z` undoes, `R` resets, `H` shows a hint, `Esc` pauses.

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Page, HUD, tower tray, menus, inline SVG icon set (with chapter icons) |
| `css/style.css` | Layout and UI styles (desktop, phone portrait and landscape) |
| `js/logic.js` | Pure rules: line of sight, coverage, dishes, bounces, relay liveness, office blocks, observatories, and the solver. Shared with Node |
| `js/art.js` | Canvas drawing for grass, hills, walls, trees, houses, towers, dishes, observatories, office blocks, the station and panels |
| `js/board.js` | Board renderer: cached terrain, coverage and shadow overlay, masked radio waves (circles, cones, bounces), house and relay links, previews |
| `js/audio.js` | WebAudio sound effects |
| `js/game.js` | Screens, tower tray and drag and drop, input (pointer and keyboard), undo, hints, stars, chapters, callouts, saved progress |
| `js/levels.js` | **Generated.** Level data with tower budgets, star thresholds and hint solutions |
| `tools/levels-src.js` | Level source maps. Edit these |
| `tools/solve.js` | Solver. Proves every level is solvable and writes `js/levels.js` |
| `tools/generate.js` | Level design helper that searches random maps for tight puzzles, with checks that each mechanic matters |
| `tests/browser.js` | End-to-end headless browser test |
| `tests/logic.test.js` | Unit tests for the rules (bounces, cones, relay, office blocks, observatories) |
| `design/` | Iris's visual and interaction spec for v3, with SVG references |

## Editing levels

1. Edit `tools/levels-src.js`. Map legend: `.` grass, `H` house, `#` wall, `^` hill, `T` tree, `Q` observatory, `B` office block, `S` station, `/` and `L` panels. Optional fields: `chapter`, `dishes` (dishes offered; the standard tower budget is then the smallest that still solves the level) and `callout` (a one-time tip).
2. Run `node tools/solve.js`. It searches every tower placement (types and dish facings included), prints each level's minimum tower count, number of solutions and solve time, and rewrites `js/levels.js`. It exits non-zero if any level is unsolvable. `--md` also prints a Markdown table. Relay levels use a different search: cover every house first, then grow the network outward from its live part, with a breadth-first bound that prunes chains that can't be finished. The whole set solves in about 4 seconds.
3. Run `node tools/solve.js --check` before committing. It fails if `js/levels.js` is stale.

To find new puzzles, run `node tools/generate.js` with no arguments to see its usage.

## Testing

```sh
npm install                 # dev only: installs Playwright
npx playwright install chromium-headless-shell
npm run serve &             # local server on port 8765
npm run check               # solver check
npm test                    # rule unit tests
npm run test:browser        # full playthrough, touch, performance, screenshots in test-results/
```

The browser test does the following:
- Plays all 38 levels with the solver's solutions, dragging towers from the tray and tapping, turning dishes by tapping, and expects 3 stars on each.
- Tests drag and drop with the mouse and with touch: place, move, remove, cancel, the finger offset, hold to build and long press to remove.
- Checks that turning a dish is free, the keyboard keys, undo (including moves and turns), reset, locked levels and chapters, saved progress (including an old 15-level save) and the mute setting.
- Requires 60fps (including mid-drag), checks the tray never overlaps the board, and fails on any console error or warning.
- Saves screenshots of each mechanic and of drags at 1280x800, 390x844 and 844x390.

Note for macOS 27: Playwright builds older than 1.63 ship a Chromium that macOS refuses to run.
