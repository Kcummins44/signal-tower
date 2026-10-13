# Signal Tower: mechanics v3, visual and interaction spec

Iris (Designer), 2026-10-13. Rules source: `Shared/Knowledge/signal-tower-mechanics.md`, plus Kaden's calls in `Shared/Memory/decisions.md`: turning a dish is free, relay links are two-way, and reflector range counts the whole bounced path.

## How to read this spec
- All tile art uses the conventions in `js/art.js`. Each function draws one tile at `(px, py)` with tile size `s`. Every size below is a fraction of `s`, so "0.26" means `s * 0.26`.
- The SVG references in this folder are drawn in a 100 x 100 tile box, so an SVG coordinate of 26 is the same as `s * 0.26`. You can copy shapes straight across.
- Soft shadows use `PALETTE.shadow` (`rgba(12, 18, 26, 0.28)`), as the existing art does. No emojis anywhere. Icons are SVG and art is canvas.
- Colour is never the only signal. Every state change also changes a shape (a badge, a dash pattern, filled or hollow lamps) or adds motion.

Reference drawings:

| File | Shows |
|---|---|
| `quiet-zone.svg` | Observatory: ok, violated, preview |
| `busy-building.svg` | Office block: 0, 1 and 2 lamps lit |
| `dish-tower.svg` | Dish facing N/E/S/W, rotate badge, cone preview |
| `relay-chain.svg` | Station, live tower, dead tower, ghost, link lines |
| `reflector-panel.svg` | `/` and `L` panels, idle and lit, plus a worked bounce |
| `tower-tray.svg` | Tray layouts (desktop, phone portrait, phone landscape) and chip states |
| `tray-drag.svg` | Drag feedback: valid, invalid, off-board cancel, moving a placed tower |

---

## 0. Palette additions

These are added to `PALETTE` in `art.js`. Existing keys are unchanged. Contrast was measured against grass `#55705a`.

| Key | Hex | Use |
|---|---|---|
| `obsWall` | `#dfe3e8` | Observatory building |
| `obsTrim` | `#b9c1ca` | Observatory base trim |
| `obsDome` | `#c3ccd6` | Observatory dome |
| `obsSlit` | `#5b6878` | Dome slit, observatory door |
| `quiet` | `#cbbff5` | Quiet ring, ok state (3.2:1 on grass) |
| `officeWall` | `#c9d1da` | Office block front |
| `officeSide` | `#aeb8c4` | Office block shaded side |
| `officeRoof` | `#8a97a6` | Office roof slab |
| `officeParapet` | `#a3afbd` | Roof edge highlight |
| `officeDoor` | `#5b6878` | Office door |
| `dishFace` | `#e8ebef` | Dish bowl (same as `towerMast`) |
| `dishInner` | `#c3cad3` | Inner bowl, mast shade |
| `stationWall` | `#d8cfc0` | Station hut wall |
| `stationRoof` | `#5b6b7c` | Station hut roof |
| `deadBase` | `#6b7480` | Dead tower base plate |
| `deadRim` | `#555e6a` | Dead tower rim and braces |
| `deadMast` | `#8d95a1` | Dead tower legs |
| `deadLight` | `#9aa7b5` | Dead tower hollow antenna ring and badge |
| `reflBase` | `#4a5563` | Reflector plinth |
| `reflFace` | `#dfe8ee` | Reflector slab face |
| `reflEdge` | `#9fb3c2` | Reflector slab back edge |
| `reflBolt` | `#9aa7b5` | Slab end bolts |

Existing colours reused: `signal` `#7fe0d0` for coverage, links and live state; `windowOn`/`hint` `#ffd27a` for lit and partial states; `danger` `#e86a5f` for violations; `windowOff` `#3a4552`.

**Danger on grass is only 1.7:1.** Wherever `danger` is drawn as a line on grass, draw a dark underlay first: the same path in `rgba(12, 18, 26, 0.45)`, 1.7 times as wide. The violation states below also add a badge, so they do not rely on the red alone.

---

## 1. Mechanics

### 1.1 Quiet Zones: tile `Q`, the radio observatory
See `quiet-zone.svg`. Q is a building: towers cannot stand on it, and it does not block signal.

**Shape** (fractions of `s`):
- Shadow: ellipse at centre (.54, .85), radii .36 x .08.
- Building: rect x .20, y .52, w .60, h .30, corner radius .04, `obsWall`. Base trim: rect .20, .78, w .60, h .04, `obsTrim`.
- Door: rect .44, .64, w .12, h .18, radius .03, `obsSlit`.
- Dome: half circle centred (.50, .54), r .26, `obsDome`. Slit: rect .47, .30, w .06, h .22, radius .02, `obsSlit`. Highlight: arc from (.30, .50) to (.42, .34), width .03, `#e9edf1` at 0.7 alpha.
- Side dish: a stem line from (.78, .52) to (.82, .38), width .03, `towerRim`, topped by an ellipse at (.82, .35), radii .10 x .05, rotated -30 degrees, `dishFace`.
- Quiet ring: circle centred (.50, .54), r .43. Dark underlay width .06 in `rgba(12,18,26,0.45)`, then the ring at width .035. Both use the same dash pattern.

**States:**

| State | When | Ring | Extra |
|---|---|---|---|
| ok | No live tower covers it | `quiet`, dash [.09, .07]. Dash offset drifts one full cycle every 12 s (calm) | None |
| violated | A placed live tower covers it | `danger`, broken dash [.04, .06]. Alpha pulses 0.55 to 1.0 at the house-alert rate (`sin(t*4)`) | Tile tint `rgba(232,106,95,0.18)`. Dome slit turns `danger`. Warning badge (below) |
| preview | The hover, hold or drag ghost would cover it | `danger`, normal dash [.09, .07], static, alpha 0.8 | Tile tint `rgba(232,106,95,0.22)`. Badge in outline only |

- **Warning badge:** a triangle with points (.84, .05), (.97, .27) and (.71, .27), filled `danger` with a .015 dark outline. Inside, a white bar (x .828, y .11, w .026, h .09) and a white dot at (.841, .232), r .016. In the preview state the triangle is drawn as an outline only (`danger` stroke, width .022) with no fill.
- **Coverage overlay:** when a Q tile is covered, draw the danger tint instead of the teal coverage tint on that tile.
- **Radio waves:** clip a tower's wave rings off Q tiles (leave them out of the wave mask), so waves visibly stop at the observatory. That gives the "broken waves" read.
- **Win check:** while any Q is violated, the houses stat chip gets a small danger outline (1.5px) and the toast reads "The observatory is picking up your signal." Show it once per violation, 2200 ms.

### 1.2 Busy Buildings: tile `B`, the office block
See `busy-building.svg`. B is a building that needs two different towers.

**Shape:**
- Shadow: ellipse at (.54, .88), radii .38 x .08.
- Front: rect .20, .30, w .60, h .56, `officeWall`. Shaded side: rect .70, .30, w .10, h .56, `officeSide`.
- Windows: a 3 x 3 grid with the bottom-middle cell left out (the door goes there). Each window is .12 x .09, radius .015. Columns start at x .27 with a step of .17. Rows start at y .38 with a step of .14.
- Door: rect .44, .74, w .12, h .12, `officeDoor`.
- Roof: rect .17, .12, w .66, h .20, radius .04, `officeRoof`. Parapet: .17, .12, w .66, h .03, `officeParapet`.
- Two roof lamps at (.36, .22) and (.64, .22), r .065.
  - **Off:** fill `windowOff` with a hollow ring stroke in `#e9edf1` at 0.55 alpha, width .02.
  - **On:** fill `windowOn`, with a glow disc of r .13 in `rgba(255,210,122,0.45)`.

**States.** Filled lamps against hollow lamps carry the meaning, not colour alone.

| Lamps | Windows | Ring | Glow |
|---|---|---|---|
| 0 of 2 | `windowOff` | The existing house alert ring (red, pulsing) | None |
| 1 of 2 | `mix(windowOff, windowOn, 0.5)` | Dashed `warm` ring, dash [.08, .06], width .03, static, 0.8 alpha. It means "partly there" | None |
| 2 of 2 | `windowOn` | None | Radial glow like a lit house, but radius .9 instead of .75 |

**Animation:**
- When a lamp turns on, scale it from 0.6 to 1 over 180 ms with `easeOutBack`, and play a short chime.
- The second lamp lights 120 ms after the first if both light on the same move.
- When a lamp turns off, fade it out over 200 ms.

**Links:** draw two house-style dashed links, one to each of the two covering towers. Pick the two nearest live towers. The link anchors on the building are the lamps themselves, at (.36, .22) and (.64, .22), so each line visibly feeds one lamp.

**HUD:** the houses counter counts a B tile as one target. It counts as lit only at 2 of 2.

### 1.3 Dish Towers
See `dish-tower.svg`. A dish faces N, E, S or W and covers a 90 degree cone that reaches radius + 2.

**Shape:**
- Base plate: identical to `tower()` (rim .22, .66, .56 x .18; base .22, .64, .56 x .14; shadow at (.56, .82), radii .30 x .10). Dishes and masts then read as one family.
- Short mast: rect .46, .42, w .08, h .28, radius .02, `towerMast`, with a right-half shade (rect .50, .42, w .04) in `dishInner`.
- **Dish assembly.** This group rotates by the facing angle around the pivot (.50, .45). Drawn here facing north:
  - Rim: ellipse at (.50, .40), radii .27 x .12, `towerRim`.
  - Bowl: ellipse at (.50, .38), radii .26 x .11, `dishFace`.
  - Inner: ellipse at (.50, .37), radii .18 x .065, `dishInner`.
  - Feed arm: line from (.50, .38) to (.50, .16), width .035, `towerDark`.
  - Feed light: dot at (.50, .15), r .045, `signal`. The halo pulses the same way as the tower's antenna light.
- **Facing arrow:** a triangle with points (.50, .02), (.43, .10) and (.57, .10), `accent` at 0.9 alpha. It rotates around the tile centre (.50, .50), so it always sits on the tile edge the dish faces.
- **Rotate badge:** a circle of r .12 at (.82, .84), in the `panel` colour, holding a 270 degree arrow in `accent` with a stroke of .024. Show it on mouse hover, on keyboard focus, and for 3 s after the player places their first dish of a session. Otherwise hide it.

**States:**
- **Placed:** faces N.
- **Turning:** each tap turns it 90 degrees clockwise. Tween the dish assembly and the arrow over 160 ms with ease-out. Play a soft click. Moves are unchanged, because turning is free.
- **Hover a placed dish (mouse) or focus it (keyboard):** show the current cone (see the preview below) and a faint "next facing" cone: dashed [.015, .025] in `rgba(233,237,241,0.25)`, no fill. The player sees what the next tap will do.
- **Dead, in relay levels:** recolour it like a dead tower (`deadBase`, `deadRim`, `deadMast`), with a hollow feed light and the broken-link badge.
- **Ghost:** 0.55 alpha, like the tower ghost.

**Cone preview** (hover, hold or drag):
- Covered tiles get the existing preview tint `rgba(127,224,208,0.16)`.
- Outline the wedge from the tile centre: two straight edges at facing ±45 degrees, and an arc of radius (reach + 0.5) tiles. Stroke `rgba(127,224,208,0.55)`, dash [.12, .10], width .03. This is the same style as the existing range circle.
- The shadow hatch shows only for tiles inside the wedge.

**Waves:** the wave mask is the covered tiles, clipped to the wedge (not to the circle). Rings start at the feed light, not at the base.

### 1.4 Relay Chain: station `S`, live and dead towers, relay links
See `relay-chain.svg`. Links are two-way.

**Station shape** (taller than a tower, with a hut):
- Shadow: ellipse at (.55, .88), radii .40 x .09.
- Lattice: legs from feet at (.32, .60) and (.68, .60) up to (.47, .08) and (.53, .08). Legs are `towerMast` at width .045. Add three pairs of cross braces in `towerDark` at width .03.
- Hut roof: rect .10, .52, w .80, h .14, radius .04, `stationRoof`.
- Hut wall: rect .14, .64, w .72, h .22, `stationWall`, with trim .14, .82, w .72, h .04 in `houseTrim`.
- Door at .44, .70, size .12 x .16, `door`. Two windows at (.22, .70) and (.64, .70), each .14 x .08, `windowOn`. The station is always powered.
- Beacon: dot at (.50, .08), r .06, `signal`. Ring at r .095, width .018, 0.7 alpha. Halo of r .16 at 0.18 alpha that breathes on a 1.6 s period, slower and calmer than a tower.
- The station emits waves like a tower, using the level radius.

**Tower states:**

| State | Look | Waves | Coverage tint |
|---|---|---|---|
| Live | The normal `tower()` | Yes | Yes |
| Dead | Base `deadBase`, rim `deadRim`, legs `deadMast`, braces `deadRim`. The antenna light is a hollow ring (r .05, stroke .02, `deadLight`) with no halo and no pulse. Broken-link badge: a circle of r .12 at (.80, .80) in `board` colour, holding two short `deadLight` strokes with a gap, like a cut cable | No | No (dead towers light nothing) |
| Ghost (would be live) | Normal ghost at 0.55 alpha, with a teal antenna light | Preview only | Preview tint |
| Ghost (would be dead) | Dead palette at 0.55 alpha, plus the badge | None | No teal tint. Show only a dotted grey range outline in `rgba(154,167,181,0.45)` |

**Relay links:**
- Draw one link per live tower, to its parent in a breadth-first tree grown from the station. Do not draw every pair in range; that gets noisy.
- Each link runs from antenna tip to antenna tip, at (.50, .12) of each tile.
- Glow line: width .12, `signal` at 0.12 alpha. Core line: solid (not dashed), width .045, `signal` at 0.6 alpha, round caps.
- **Two-way packets:** two `#d8fff9` dots of r .04 travel in opposite directions along the link, with a period of 1.8 s. House links stay dashed with one-way packets, so the two kinds read differently.

**Transitions:**
- **Tower goes dead:** its link splits at the midpoint and the two halves retract to their ends over 250 ms. The tower cross-fades to the dead palette over 300 ms. Its waves fade over 300 ms.
- **Tower comes alive:** the link draws out from the parent over 250 ms. The tower then pops to the live palette, and its waves grow in as they do for a new tower.
- **Several towers at once:** chain the animation outward by tree depth, 80 ms per step, so the player sees the signal travel along the chain.

### 1.5 Reflector Panels: tiles `/` and `L`
See `reflector-panel.svg`. A panel is fixed and blocks direct signal. Range is measured over the whole bounced path.

**Shape (`/`).** `L` is the same drawing mirrored horizontally, running from top-left to bottom-right.
- Drop shadow: rect .14, .18, w .76, h .76, radius .12, `shadow`.
- Plinth: rect .10, .10, w .80, h .80, radius .12, `reflBase`. Top lip: .10, .10, w .80, h .04, `wallFront`.
- Slab back edge: line from (.24, .82) to (.82, .24), width .16, round caps, `reflEdge`.
- Slab face: line from (.22, .78) to (.78, .22), width .14, round caps, `reflFace`.
- Highlight: line from (.26, .70) to (.70, .26), width .03, white at 0.7 alpha.
- End bolts: dots at (.22, .78) and (.78, .22), r .05, `reflBolt`.

**States:**
- **Idle:** as drawn above.
- **Lit** (any live tower has line of sight to the panel):
  - A teal halo behind the slab: the same line, width .24, `signal` at 0.35 alpha.
  - A white glint (a line .16 long, width .05, white at 0.9 alpha) that slides along the slab from one end to the other every 1.8 s.
  - The glint is the motion cue. The halo is the colour cue.

**Showing the bounce:**
1. **Coverage:** reflected tiles get the same teal coverage tint as direct tiles. Covered is covered.
2. **Waves:** for each tower that lights a panel, add a second wave layer. Its rings are centred on the **image point** (the tower mirrored across the panel line). It is masked to the reflected tiles and clipped to the far side of the panel line, so the rings appear to come out of the panel. Its ring radius limit is the full path length (range minus the tower-to-panel distance, measured from the image point). That matches Kaden's whole-path rule.
3. **House links:** a house lit by reflection gets a bent dashed link with two segments: tower antenna to panel centre, then panel centre to house. Draw a small `#d8fff9` dot of r .035 at the bend. The packet travels both segments in order.
4. **Preview only** (hover, hold or drag on a spot that would light a panel):
   - A faint dashed circle around the image point: radius (range + 0.5) tiles, `rgba(233,237,241,0.30)`, dash [.08, .11], width .03.
   - A small dashed ring of r .30 at the image point itself, at 0.3 alpha: the mirror tower.
   - Clip both to the board. These are never shown during normal play; they would be clutter.

---

## 2. Tower tray

See `tower-tray.svg` and `tray-drag.svg`.

### 2.1 What it holds
- One chip per tower type the level offers. Classic levels show only **Tower**. Dish levels show **Tower** and **Dish**.
- No other type is needed: Relay uses ordinary towers, and Quiet, Busy and Reflector levels add no new piece.
- Never show a chip for a type the level does not use.
- The tray is always visible during play, even on levels with a single type, so drag is always available.
- **The Towers pips stat is removed from the stats bar.** The tray counts replace it, and two counters for the same thing would disagree during a drag. The stats bar keeps Houses and Moves.

### 2.2 Layout

**Desktop, 1280 x 800**
- `#hud-bottom` becomes a single centred row: tray shelf, a divider, then Undo, Reset and Hint.
- Tray shelf:
  - Background `rgba(38,49,61,0.6)` with a 1px border in `--line`. Radius 16px, padding 6px, gap 10px between chips.
- Divider: 1px x 40px, `--line`, with 12px margin on each side.
- Tool buttons: unchanged (76 x 56).
- Bar padding stays at 10px 16px 14px. The bar grows about 10px compared with today, and the board loses only that much.

**Phone portrait, 390 x 844**
- `#hud-bottom` stacks into two rows with an 8px gap.
- Row 1: the tray shelf at full width inside the 16px gutters. Chips use `flex: 1`, 64px tall.
- Row 2: Undo, Reset and Hint, as today, but 52px tall.
- The current phone layout has plenty of empty space above and below the board (see the earlier Level 13 phone screenshot), so the board barely shrinks.

**Phone landscape, about 844 x 390** (existing `max-height: 560px` landscape rule)
- The right column becomes: stats (Houses and Moves, stacked, 38px each), then the tray shelf, then the tools.
- The tray chips sit side by side (each about 84 x 64). With one type, the single chip fills the shelf width.
- The tools stay a row of three, 48 to 52px tall.
- Height check: 2 x 38 + 6 + 88 + 12 + 52 is about 234px. That fits inside 390 minus the 56px top HUD.

### 2.3 Chips
- **Size:** 76 x 64 on desktop; flex width x 64 on phone. Radius 12. Background `--panel`. Shadow `0 2px 8px rgba(6,10,16,0.25)`, like `.tool-btn`.
- **Content:**
  - A canvas icon of the real tower art, drawn with `SignalArt.tower` or the new dish function at 36px, centred, with its top 4px from the chip's top.
  - A label underneath: "Tower" or "Dish", 0.72 to 0.78rem, weight 600, `--text`.
- **Count badge:** a pill 30 x 22 that hangs over the top-right corner (6px above, 4px to the right of the chip edge). Background `--accent`, text `--accent-ink` (9:1), 0.8rem, weight 700, tabular figures.

**Chip states:**

| State | Look |
|---|---|
| Normal | As above. Hover: background `--panel-2` |
| Selected (the type that a tap on a tile places) | Background `--panel-2`, plus a 2px inset ring in `--accent`. Set `aria-pressed="true"` |
| Holding (a tower of this type is being dragged) | Icon at 0.5 alpha. The badge already shows the count minus one, since the tower is in hand |
| Empty (0 left) | Icon at 0.35 alpha. Label in `--muted` at 0.7. Badge background `--line`, text `--muted`, showing "0". Not draggable; `aria-disabled="true"` |
| Pressed | `transform: scale(0.96)` for 100 ms, like `.tool-btn` |
| Count changes | The badge scales 1 to 1.2 to 1 over 200 ms |

- **Pressing an empty chip:** the chip plays the existing `bump` shake. The toast says "No dish towers left. Drag one off the board to free it." (or "No towers left. ...").
- **All chips empty:** nothing extra. The zero badges say it.
- **Selection default:** **Tower** is selected at the start of every level. If the selected type runs out, selection falls back to the first type with towers left. If none are left, a tile tap gives the existing "No towers left" bump and toast.

### 2.4 Dragging from the tray (`tray-drag.svg`)

**Pick-up**
- Press a chip, then move 6px (mouse) or 10px (touch or pen) to start a drag.
- A press with no movement is a tap. A tap selects that type.
- On pick-up:
  - The badge drops by one (holding state).
  - A soft lift sound plays.
  - A ghost appears at the pointer: the real tower or dish art at the board tile size, never smaller than 44px. It grows from 0.8 to 1.0 over 120 ms.

**Ghost position**
- **Mouse:** the ghost's tile centre sits on the cursor.
- **Touch and pen:** the ghost sits **above the finger** by `max(56px, 1.1 x tile)`. A 2px tether line in `rgba(233,237,241,0.35)` runs from the finger point to the ghost base. The player can always see what they are carrying.
- **Target tile:** the tile under the ghost's centre, not under the finger. Top-row tiles are reachable because the finger is still on the board. Bottom-row tiles are reachable because the finger can go down onto the tray, which is below the board.

**Snapping**
- When a target tile exists, the ghost eases to that tile's position over 80 ms and shrinks to exactly the tile size.
- Over no tile, it follows the pointer exactly.

**Over a valid tile** (grass or hill, empty):
- Ghost at 0.85 alpha.
- The existing white hover ring.
- The full placement preview for that type: circle or cone, shadow hatch, quiet-zone danger preview, Busy lamp preview (a hollow lamp that would light shows a dashed `warm` ring around that lamp), relay live or dead ghost with its would-be link line (dashed at 0.5 alpha), and reflector image ring.

**Over an invalid tile** (house, wall, tree, Q, B, S, panel, or a tile with a tower):
- Red hover ring (existing style, with the dark underlay).
- Ghost at 0.45 alpha with a red slash across its base: a line from (.20, .80) to (.80, .20), width .06, `danger`.
- No coverage preview.

**Off the board or over the tray**
- Off the board means outside the board rect by more than 0.3 tile.
- The ghost shrinks to 0.8 and drops to 0.5 alpha.
- When the pointer is over the shelf, the shelf border turns into a 2px dashed `--accent` line with the fill `rgba(127,224,208,0.08)`.

**Drop**

| Where | Result |
|---|---|
| Valid tile | Place the tower: existing pop-in, 1 move. A dish lands facing N |
| Invalid tile, off the board, or on the tray | Cancel. The ghost flies back to its chip over 220 ms (ease-in, shrinking to chip icon size), then the badge count goes back up with its bump. No move |

`Esc` or `pointercancel` during a drag also cancels with the fly-back.

### 2.5 Dragging a placed tower
- **Start:** press a placed tower and move 10px. A press with no movement stays a tap (see 2.6).
- **During the drag:**
  - The origin tile shows a dashed slot: a rounded rect inset .08, radius .14, white at 0.45 alpha, dash [.09, .07].
  - The tower's own coverage and links are removed from the overlay, so the preview shows what the board will look like after the drop.
  - A dish keeps its facing while being moved.
  - The shelf shows its drop state with the text **"Drop here to remove"** in `--accent`, 0.9rem, centred over the chips.

**Drop:**

| Where | Result |
|---|---|
| Another valid empty tile | Move. Counts as 1 move and is one undo step |
| Its own tile | Nothing. No move |
| Occupied or invalid tile | Invalid styling during the drag; on drop the tower flies back to its origin over 180 ms. No move. No swapping |
| Off the board or on the tray | Remove. The ghost flies to its chip and the count goes up. 1 move, like today's tap-to-remove |

### 2.6 Tap, hold and keyboard (all still work)

**Tap and hold**

| Action | Result |
|---|---|
| Tap an empty tile | Places the **selected** type. Tower by default, so classic tap-to-place is unchanged |
| Tap a standard tower | Removes it (unchanged) |
| Tap a dish | Turns it 90 degrees clockwise. Free; not a move. Remove a dish by dragging it off, or with the keyboard |
| Mouse hover | Previews reach (unchanged) |
| Touch hold on an empty tile | Previews reach, and release builds (unchanged). Sliding the finger moves the preview. Add the same lifted ghost and tether as the drag (offset `max(56px, 1.1 x tile)`), so the finger no longer hides the tile. The target is the tile under the ghost |

**Keyboard**
- `1` or `2` selects Tower or Dish. The chips are also real buttons in the tab order. Enter or Space on a chip selects it.
- Chip labels for screen readers: `aria-label` such as "Dish tower, 1 left, selected".
- Arrow keys move the cursor (unchanged). The cursor shows the selected type's ghost and preview.
- `Enter` on an empty tile places the selected type. On a standard tower it removes it (unchanged). On a dish it turns it.
- `Delete` or `Backspace` removes the tower under the cursor (any type).
- `M` picks up the tower under the cursor. Arrows then move its ghost, with the full preview. `Enter` drops it (a move); `Esc` cancels.
- `Z`, `R`, `H` and `Esc` are unchanged.

**Hit sizes**
- Chips are at least 64px tall. Badges are decorative; the whole chip is the hit area.
- Tool buttons stay at least 48px. The rotate badge is not its own target; tapping anywhere on the dish tile turns it.
- Board tiles can drop below 44px on phones (about 35px on a 10-wide map at 390px). The finger offset and the snapping are what make that workable, so keep both.

### 2.7 Motion summary

| Event | Duration | Easing |
|---|---|---|
| Ghost grow on pick-up | 120 ms | ease-out |
| Snap to tile | 80 ms | ease-out |
| Fly back to chip, cancel | 220 ms | ease-in |
| Fly back to origin, invalid move | 180 ms | ease-in |
| Badge count bump | 200 ms | 1 to 1.2 to 1 |
| Dish turn | 160 ms | ease-out |
| Busy lamp on | 180 ms | easeOutBack |
| Relay link draw or retract | 250 ms | ease-out, chained 80 ms per depth |
| Reflector glint | 1.8 s loop | linear |
| Quiet ring drift | 12 s loop | linear |

`prefers-reduced-motion`:
- Ghosts jump instead of easing.
- Fly-backs become instant.
- The ring drift and glint loops stop.
- The state colours, badges and dash patterns all stay.

---

## 3. Onboarding

Each mechanic's first level uses the existing level `hint` toast (shown on start for 4200 ms). Where noted, it also gets a **callout**: a small toast-styled bubble anchored to the new tile.

**Callout style**
- Background `rgba(38,49,61,0.94)`, radius 12px, padding 8px 12px, max-width 240px, 0.85rem.
- An 8px caret points at the tile. The bubble sits above the tile, or below it if the tile is in the top two rows.
- The target tile gets an `accent` pulsing ring (the hint ring style, in `accent` instead of `warm`).
- It closes on the player's first board action, or after 7 s.
- It appears once per save (store a flag next to progress).

**Wording, one line each:**

| First level of | Start toast (`hint`) | Callout on the new tile |
|---|---|---|
| Level 1 (tray intro) | "Drag a tower from the tray, or tap a grass tile. Light up every house." | On the Tower chip: "Drag me onto the board." |
| Quiet Zones | "Keep your signal off the observatory. Walls and hills can shield it." | "Needs quiet. No signal here." |
| Busy Buildings | "Office blocks need two towers. Light both lamps on the roof." | "Two towers must reach me." |
| Dish Towers | "Dishes reach far, but only one way. Tap a dish to turn it. Turning is free." | On the Dish chip: "Drag a dish out, then tap it to aim." |
| Relay Chain | "Towers only work when they link back to the station. Build a chain." | "Start your chain here." |
| Reflector Panels | "Signal bounces off panels. Aim a tower at one to reach round corners." | "Bounce signal off me." |

**Follow-up callout, Dish levels only:** after the first dish is placed, show "Tap to turn. Turning is free." for 3 s, anchored to the dish, together with the rotate badge.

Copy rule: short sentences, no jargon, no emojis. Keep "tower", "dish", "station" and "panel" consistent everywhere (toasts, chips, README).

---

## 4. Level select: chapters

Group levels by mechanic. Each chapter's first level is a gentle teaching level, like "First Light". The last chapter mixes mechanics.

| Chapter | Name | Mechanic | Suggested levels |
|---|---|---|---|
| 1 | **Main Street** | The basics (existing levels) | 1 to 15 |
| 2 | **Quiet Hours** | Quiet Zones | 16 to 19 |
| 3 | **Rush Hour** | Busy Buildings | 20 to 23 |
| 4 | **Point the Dish** | Dish Towers | 24 to 27 |
| 5 | **Relay Run** | Relay Chain | 28 to 31 |
| 6 | **Hall of Mirrors** | Reflector Panels | 32 to 35 |
| 7 | **Grand Broadcast** | Mixed finale | 36 and up |

**Layout of the level select screen**
- Keep the one scroll and the existing 5-column grid (3 columns on phones).
- Before each chapter's cards, add a header row that spans the whole grid:
  - Left: a 20px icon in `--warm` (see the icon list below).
  - Then "Chapter 2" as the existing eyebrow style (0.72rem, uppercase, `--muted`) above the name (1rem, weight 700).
  - Right: the chapter star count ("7 / 12" with the star icon), in `--warm`.
  - Spacing: 18px above, 8px below, and a 1px `--line` rule above every header except the first.
- A chapter is locked until the last level of the previous chapter is beaten.
  - The header gets the lock icon in place of the stars and drops to 0.55 opacity.
  - Its cards use the existing locked style.

**Chapter icons** (new `<symbol>` entries in the `index.html` sprite, 24 x 24, drawn like the existing icons):

| Chapter | Icon |
|---|---|
| Main Street | The existing `i-house` |
| Quiet Hours | `i-quiet`: a dome with a dashed arc |
| Rush Hour | `i-busy`: a tall block with two dots on top |
| Point the Dish | `i-dish`: a bowl arc with a feed line |
| Relay Run | `i-relay`: two masts joined by a line |
| Hall of Mirrors | `i-panel`: a diagonal slab with a short bounce arrow |
| Grand Broadcast | The existing `i-tower` |

- Level card thumbnails already render the map, so the new tiles show up automatically once `art.js` can draw them. A thumbnail should draw dishes facing N and every tower in the live palette.

---

## 5. Notes for Forge and Probe
- New art functions in `art.js`, each matching the shapes above:
  - `observatory(ctx, px, py, s, state, t)`
  - `office(ctx, px, py, s, lamps, t)`
  - `dish(ctx, px, py, s, facing, pulse, ghost, dead)`
  - `station(ctx, px, py, s, pulse)`
  - `reflector(ctx, px, py, s, kind, lit, t)`
  - `tower(...)` gains a `dead` flag
- Q, B, S and panel tiles are static, so draw them into the cached terrain layer. Draw their animated parts per frame: the quiet ring drift and violation pulse, the lamps, the beacon halo and the panel glint.
- Probe should screenshot each mechanic's first level at 1280 x 800, 390 x 844 and 844 x 390, plus one mid-drag frame on each size, and check:
  - The tray never overlaps the board or the tools.
  - The badges stay readable.
  - The ghost is visible above the finger.
  - The violated, partial and dead states can be told apart in a greyscale screenshot (the shape cues are what count).
