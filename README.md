# Signal Tower

A browser puzzle game: build radio towers so that every house in town gets signal.

**Play:** https://kcummins44.github.io/signal-tower/

Plain HTML, CSS and JavaScript with no build step and no runtime dependencies. All art is drawn with canvas and SVG code, and all sound is synthesized with WebAudio.

## Rules

- Tap or click a grass tile or a hill to build a tower. Tap a tower to remove it.
- Each level gives you a fixed number of towers.
- A tower reaches every tile whose centre lies within its radius (2 tiles on most levels, 3 on levels 13 and 14).
- **Walls** block signal.
- **Hills** block signal for towers on the ground. A tower built on a hill gets +1 range and sees over other hills.
- **Trees** can't hold towers, but signal passes through them.
- Line of sight runs from the centre of the tower's tile to the centre of each target tile. A line that only grazes a blocker's corner passes. A line squeezing between two blockers that touch diagonally is blocked.
- You win when every house is connected.

**Stars.** Each place, remove or undo counts as one move. The solver sets the thresholds for each level:

| Stars | Requirement |
|-------|-------------|
| 3 | Moves ≤ the towers in the smallest solution (a perfect run), with no hints |
| 2 | Moves ≤ that number + max(2, that number). Using a hint caps the level at 2 stars |
| 1 | Any solve |

You unlock the next level by finishing the current one. Stars, best move counts and the sound setting are saved in `localStorage`.

**Controls:**
- Mouse: hover a tile to preview a tower's reach before you build.
- Touch: hold a tile to preview its reach, release to build.
- Keyboard: arrow keys move the cursor, Enter builds, `Z` undoes, `R` resets, `H` shows a hint, `Esc` pauses.

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Page, HUD, menus, inline SVG icon set |
| `css/style.css` | Layout and UI styles (desktop, phone portrait and landscape) |
| `js/logic.js` | Pure rules: line of sight, coverage, connections and the solver. Shared with Node |
| `js/art.js` | Canvas drawing for grass, hills, walls, trees, houses and towers |
| `js/board.js` | Board renderer: cached terrain, coverage and shadow overlay, masked radio waves, link lines |
| `js/audio.js` | WebAudio sound effects |
| `js/game.js` | Screens, input (pointer and keyboard), undo, hints, stars, saved progress |
| `js/levels.js` | **Generated.** Level data with tower budgets, star thresholds and hint solutions |
| `tools/levels-src.js` | Level source maps. Edit these |
| `tools/solve.js` | Solver. Proves every level is solvable and writes `js/levels.js` |
| `tools/generate.js` | Level design helper that searches random maps for tight puzzles |
| `tests/browser.js` | End-to-end headless browser test |

## Editing levels

1. Edit `tools/levels-src.js`. Map legend: `.` grass, `H` house, `#` wall, `^` hill, `T` tree.
2. Run `node tools/solve.js`. It searches every tower placement, prints each level's minimum tower count and number of solutions, and rewrites `js/levels.js`. It exits non-zero if any level is unsolvable.
3. Run `node tools/solve.js --check` before committing. It fails if `js/levels.js` is stale.

To find new puzzles, run `node tools/generate.js` with no arguments to see its usage.

## Testing

```sh
npm install                 # dev only: installs Playwright
npx playwright install chromium-headless-shell
npm run serve &             # local server on port 8765
npm run check               # solver check
npm run test:browser        # full playthrough, touch, performance, screenshots in test-results/
```

The browser test does the following:
- Plays all 15 levels with mouse clicks and expects 3 stars on each.
- Plays the last level with touch taps.
- Checks undo, reset, locked levels, saved progress and the mute setting.
- Requires 60fps, and fails on any console error or warning.

Note for macOS 27: Playwright builds older than 1.63 ship a Chromium that macOS refuses to run.
