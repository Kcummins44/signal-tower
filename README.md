# Signal Tower

A small browser puzzle game. Place a limited number of towers on a grid so that every house gets signal.

Plain HTML, CSS and JavaScript. No build tools or dependencies.

## Play

Open `index.html` in a browser. No server is needed.

## Rules

- Click an empty tile or a hill to place a tower. Click a tower again to remove it.
- Each level gives you a fixed number of towers.
- A tower reaches every tile within its radius (straight-line distance, radius 2 on all current levels).
- **Walls** block signal. A tile is reached only if the line from the tower to it doesn't pass through a wall.
- **Hills** add +1 to the range of a tower placed on them.
- Houses and walls can't hold towers.
- You win when every house has signal.

Each place or remove counts as one move. Your best move count per level is saved in the browser's `localStorage`.

**Controls:** mouse or keyboard (Tab to move between tiles, Enter or Space to place). Press `R` to reset and `Esc` to return to level select.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page layout: level select, game screen, win overlay |
| `style.css` | Styles |
| `logic.js` | Pure game rules (coverage, line of sight, win check). Used by the game and the tests |
| `levels.js` | Level data |
| `game.js` | UI: rendering, input, screens, saved progress |
| `tests/check-levels.js` | Solver that verifies every level |

## Adding a level

Add an entry to `LEVELS` in `levels.js`:

```js
{
  name: 'My Level',
  hint: 'Shown under the title.',
  towers: 2,      // tower budget
  radius: 2,      // base signal radius
  map: [          // . empty   H house   # wall   ^ hill
    'H...#',
    '..^.#',
    '....H',
  ],
}
```

Then run the level check:

```sh
node tests/check-levels.js
```

It brute-forces every tower placement and prints the fewest towers each level needs. It exits non-zero if a level is unsolvable or can be solved with fewer towers than its budget.
