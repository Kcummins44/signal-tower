# Signal Tower

A browser puzzle game: build radio towers so that every house in town gets signal.

**Play:** https://kcummins44.github.io/signal-tower/

Plain HTML, CSS and JavaScript with no build step and no runtime dependencies. All art is drawn with canvas and SVG code, and all sound is synthesized with WebAudio.

## Story: "The Keeper of Wren Hollow"

After a storm knocks down the old radio tower, Nell, the retired signal keeper, teaches her apprentice Sam (the player) to put Wren Hollow back on air in time for Starfall Night. The cast also includes Juniper the astronomer and Otto the mayor. The story is Iris's (`design/story-spec.md`). Its text and art come only from her files: `design/story-data.json`, `design/portrait-*.svg` and `design/town-hero.svg`. `node tools/build-story.js` copies them into `js/story.js`, so nothing is retyped. Line ids are kept for later localisation.

**When things play** (each scene plays once, automatically):
- The **prologue** plays the first time a fresh save taps Play, over the town at night.
- A **chapter's opening** plays the first time you enter the chapter's first level (1, 16, 20, 24, 28, 32 and 36), over the dimmed board, before the level's tip. Focus rings mark the tiles the line talks about.
- **Mid-chapter scenes** play before levels 9, 30 and 37.
- After a **first-time win**, the map shows a **postcard** with that level's line once the road has drawn. It goes after 4 seconds or a tap, and never blocks the next circle.
- After a **chapter's last level**, the road stops at the next chapter's banner. Then come the postcard, the chapter's closing scene over the dimmed map, and a **town card** as a new landmark lights up. The banner then opens and the road goes on to the next circle.
- After level 38 come the closing scene, the town card, the **epilogue** over the fully lit town, and an ending card with **Story** and **Level map** buttons.
- Replaying a level never replays its scenes or postcard.

**Controls in a scene:**
- **Tap** finishes the line, then goes to the next.
- **Hold** (400ms) fast-forwards while held.
- **Fast forward** button: types 4x and moves on by itself.
- **Skip** ends the scene and marks it seen.
- **Keyboard:** Enter or Space for next, Esc to skip, F for fast forward, hold Space to fast-forward. The game's keys are ignored while a scene plays.

**Start screen:** the town hero lights one landmark per finished chapter: Main Street, the observatory, the office block, the dish farm, the station and the Glass Lanes. Bunting and meteors appear after chapter 7. A newly lit landmark brightens in once.

**Level map:**
- Finished chapters' banners say **Connected**.
- Tapping an open banner replays its chapter's opening.
- A beaten circle's name pill shows its level line on hover or focus.

**Story log:** the book button on the map, or **Story** in the pause menu.
- Scenes are grouped by chapter.
- Seen scenes have **Play** (replays over the town and never changes the save) and **Read** (a transcript).
- Locked scenes say which level unlocks them.

**Settings:**
- **Story scenes** On/Off. Off means nothing plays by itself, but the town still lights and the log still fills.
- **Text speed:** Normal, Fast or Instant.

**Saves:**
- The save gains a `story` field: `seen`, `townShown`, `offered`, `on` and `speed`.
- A save from before the story is filled in silently from its progress. Scenes it is past count as seen, and its town is lit. No scene is forced.
- On the first map visit it gets a one-time card: **Story so far (about 2 min)**, which plays the prologue and each finished chapter's closing scene, or **Later**.

**Accessibility:**
- The scene is a modal dialog labelled with the scene title. Focus moves into it and back out.
- A polite live region reads each whole line once, with the speaker's name. The typed text is hidden from screen readers.
- With reduced motion, lines appear whole, nothing slides and the town is still.

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
- Mouse: hover a tile to preview a tower's reach before you build. Hover a dish to see its cone and the next facing (clipped to the board).
- Walls block signal, and the tiles behind a wall look like plain ground. You see the block because the coverage tint and the radio waves stop at the wall. While you preview a placement, faint dashed squares mark the tiles that tower would reach if the wall weren't there.
- Touch: the tower lands on the tile under your finger. That tile is tinted and ringed so it shows round your fingertip, and a copy of the tower floats straight above it (to the side on the top row when there is no room above) so your finger doesn't hide it. Hold an empty tile to lift a tower there and preview it; release to build. Hold a tower to remove it.
- Keyboard: arrow keys move the cursor, Enter builds (or removes a tower, or turns a dish), `1` / `2` pick Tower / Dish, `M` picks up the tower under the cursor (arrows move it, Enter drops, Esc cancels), `Delete` removes, `Z` undoes, `R` resets, `H` shows a hint, `Esc` pauses.

## Screens

- **Start screen:** a night scene in which a tower lights up three houses in turn (Iris's `design/title-hero.svg`, still under reduced motion). One big button: **Play** on a fresh save, **Continue** with the next level's number and name, or **Play again** once every level is beaten (it opens the map). Below it are **Level map** and **Settings**, plus a stars and levels progress strip after the first clear. A sound button sits top right.
- **Level map:** one winding road of circle buttons, level 1 at the top, with a banner across the road for each chapter. Locked levels show a lock (tapping one says which level to finish first). The next level to play is a big teal circle with pulse rings and its name. Beaten levels show their stars, and a gold ring for 3 stars. Houses along the road light up when their level is beaten. The map opens scrolled to your level, and the **Play level N** button at the bottom starts it. Keyboard: arrows move along the road, Home jumps to your level, Enter plays, Esc goes back.
- **Road fill:** the first time you beat a level, the next time you open the map the road draws on to the next circle, a signal dot rides along it, and the next level pops open (a chapter banner opens as the road passes). It plays once: the save keeps a `road` count of segments already shown (a damaged save's count is clamped to the first unbeaten level). Saves from before the map count every beaten level as shown. Any tap or key skips it. Turning the phone while it plays relays the map out when it ends.
- **After a win:** the win screen's **Next level** goes to the level map. The road draws on from the level you beat, then the next circle is focused and ringed, with its name showing; one tap (or Enter) enters it. After replaying a level you had already beaten there is no new road, and the map lands on the circle after it straight away. With reduced motion the road appears without drawing. **Replay** and the **Level map** button work as before.
- **Map events (for code):** `runMapEvents` in `js/game.js` plays everything that runs on the map as it opens, in order: the road fill, then any step added with `queueMapEvent(fn)` (for example a story scene after a chapter win), then the landing on the next circle. A step is `fn(done)` and calls `done()` when it ends.
- **Double taps:** board and map taps are ignored for 300ms after any screen change, so the second tap of a double tap on Play, Next level or Replay never builds a tower or skips the road.

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Page, HUD, tower tray, menus, inline SVG icon set (with chapter icons) |
| `css/style.css` | Layout and UI styles (desktop, phone portrait and landscape) |
| `js/logic.js` | Pure rules: line of sight, coverage, dishes, bounces, relay liveness, office blocks, observatories, and the solver. Shared with Node |
| `js/art.js` | Canvas drawing for grass, hills, walls, trees, houses, towers, dishes, observatories, office blocks, the station and panels |
| `js/board.js` | Board renderer: cached terrain, coverage overlay and blocked-tile preview hint, masked radio waves (circles, cones, bounces), house and relay links, previews |
| `js/audio.js` | WebAudio sound effects |
| `js/story.js` | **Generated** by `tools/build-story.js` from Iris's design files: `window.STORY` (scenes, lines, level lines, town captions) and `window.STORY_ART` (portraits, town hero) |
| `js/story-ui.js` | Story presentation: dialogue scene player, postcard, town, catch-up and ending cards, town art, Story log rendering |
| `css/story.css` | Story styles (card sizes for phone, landscape and desktop; town layers; reduced motion) |
| `tools/build-story.js` | Builds `js/story.js`; `--check` fails if it is stale |
| `js/game.js` | Story triggers (when scenes, postcards and town cards play), screens (start screen, road-path level map and its road animation), tower tray and drag and drop, input (pointer and keyboard), undo, hints, stars, chapters, callouts, saved progress |
| `js/levels.js` | **Generated.** Level data with tower budgets, star thresholds and hint solutions |
| `tools/levels-src.js` | Level source maps. Edit these |
| `tools/solve.js` | Solver. Proves every level is solvable and writes `js/levels.js` |
| `tools/generate.js` | Level design helper that searches random maps for tight puzzles, with checks that each mechanic matters |
| `tests/browser.js` | End-to-end headless browser test |
| `tests/logic.test.js` | Unit tests for the rules (bounces, cones, relay, office blocks, observatories) |
| `design/` | Iris's visual and interaction specs with SVG references: v3 mechanics, and the polish pass (start screen, level map, blocked tiles; `title-hero.svg` is used in the game) |

## Editing levels

1. Edit `tools/levels-src.js`. Map legend: `.` grass, `H` house, `#` wall, `^` hill, `T` tree, `Q` observatory, `B` office block, `S` station, `/` and `L` panels. Optional fields: `chapter`, `dishes` (dishes offered; the standard tower budget is then the smallest that still solves the level) and `callout` (a one-time tip).
2. Run `node tools/solve.js`. It searches every tower placement (types and dish facings included), prints each level's minimum tower count, number of solutions and solve time, and rewrites `js/levels.js`. It exits non-zero if any level is unsolvable. `--md` also prints a Markdown table. Relay levels use a different search: cover every house first, then grow the network outward from its live part, with a breadth-first bound that prunes chains that can't be finished. The whole set solves in about 4 seconds.
3. Run `node tools/solve.js --check` before committing. It fails if `js/levels.js` is stale.

Story text and art: edit Iris's files in `design/`, then run `node tools/build-story.js` (and `--check` before committing). The logic tests check the data: line lengths, speakers, triggers, unique ids, plain ASCII, and that `js/story.js` matches `design/story-data.json` exactly.

To find new puzzles, run `node tools/generate.js` with no arguments to see its usage.

## Testing

```sh
npm install                 # dev only: installs Playwright
npx playwright install chromium-headless-shell
npm run serve &             # local server on port 8765 (if that port is busy, serve elsewhere and set GAME_URL)
npm run check               # solver check
npm test                    # rule unit tests
npm run test:browser        # full playthrough, touch, performance, screenshots in test-results/
```

The browser test does the following:
- Plays all 38 levels with the solver's solutions, dragging towers from the tray and tapping, turning dishes by tapping, and expects 3 stars on each.
- Tests drag and drop with the mouse and with touch: place, move, remove, cancel, drops landing on the tile under the finger or cursor (100 drags each on phone portrait, phone landscape and desktop, including off-centre spots), hold to build and long press to remove.
- Checks that turning a dish is free, the keyboard keys, undo (including moves and turns), reset, locked levels and chapters, saved progress (including an old 15-level save) and the mute setting.
- Checks the start screen at three sizes (fits, nothing overlaps, copy for fresh, mid and finished saves), the level map (locked, current, beaten and 3-star nodes, scroll position, keyboard and click navigation, the locked-level toast), the road fill (draws once after a first clear, opens a chapter, never replays, tap to skip, old saves), that wall-blocked tiles are never drawn dark, that pressing R just after a win never lets the win screen pop over the fresh level, and that a dish's cone stops at the board edge.
- Checks the after-win flow: Next level goes by the map (road, highlight, focus, one tap or Enter to enter, skip on tap, replay of a beaten level, reduced motion, a queued map event), that a double tap or double click on Play, Replay or Next never builds a stray tower or skips the road, that rotating during the road animation relays the map out, and that a damaged `road` count is clamped.
- Checks the story with scenes on:
  - the prologue on a fresh save, and the chapter openings with focus rings that the card never covers
  - Enter, Esc, F, hold to fast-forward, Skip and fast forward
  - no board input or game keys during a scene
  - postcards, and the chapter close after level 15: road paused at the banner, scene over the map, town card, banner opening
  - the Story log (transcripts word for word, replays that never change the save) and banner replays
  - Story scenes off
  - old saves: filled in silently, no forced scenes, the one-time offer with Later, and "story so far" with Skip
  - the ending after level 38, reduced motion, and 60fps during a scene
  - screenshots (`story-*.png`) of the dialogue card, chapter end, postcard, town card and the start-screen town at 0, 3 and 7 chapters, at three sizes
  - Other tests start with scenes off (a test-only flag).
- Requires 60fps (including mid-drag), checks the tray never overlaps the board, and fails on any console error or warning.
- Saves screenshots of each mechanic and of drags, and (`polish-*.png`) of the start screen, the level map on a fresh and a mid-progress save and a level with wall-blocked tiles, at 1280x800, 390x844 and 844x390.

Note for macOS 27: Playwright builds older than 1.63 ship a Chromium that macOS refuses to run.
