# Signal Tower story spec: "The Keeper of Wren Hollow"

Iris, 2026-10-14. This is for Forge to build in `js/story.js`, and it is written to port to Swift later.

The story content lives in **`design/story-data.json`**. That file is the single source of truth: 19 scenes, 81 lines, 38 level lines, speakers and town layers. Copy it into `js/story.js` as `window.STORY = <the JSON>`, and don't retype the text. The script in section 3 is the same text in readable form.

Art references, all rendered and checked in headless Chromium:

| File | What |
|---|---|
| `design/portrait-sam.svg`, `portrait-nell.svg`, `portrait-juniper.svg`, `portrait-otto.svg` | Each character in three moods, plus the sizes used in the card |
| `design/dialogue-card-phone.svg` | The card at 390x844 and 844x390, plus a narrator line |
| `design/dialogue-card-desktop.svg` | The card at 1280x800 |
| `design/story-map-flow.svg` | The map after a win (level postcard) and after a chapter close (town card) |
| `design/town-hero.svg` | **New start-screen hero.** It is `title-hero.svg` with seven chapter layers added. Same coordinates; inline it in place of `title-hero.svg` |
| `design/town-changes.svg` | The town before (fresh save) and after (all chapters done) |

---

## 1. Premise and tone

### Pitch
Wren Hollow is a small valley town. After a big autumn storm it wakes up in silence: the old radio tower on the hill has come down, and every radio in town has gone quiet. There is no weather report, no evening songs, and no Radio Wren, the little station that has been on air for forty years. Nell, the retired signal keeper, takes on one last apprentice: you, Sam. Together you put the Hollow back on air one street at a time, from Main Street to the hilltop observatory, the busy downtown, the orchard farms, the old station and the twisting Glass Lanes. You need to finish in time for Starfall Night, when the whole town listens to Radio Wren call out the yearly meteor shower live.

### Stakes
The stakes are gentle and clear.
- **The town:** the council wants the Hollow connected. If Radio Wren can't reach every house by Starfall Night, the festival broadcast is off. The epilogue reveals the station would have been switched off for good; it's never a threat during play.
- **Personal:** Nell is handing over the tower. The last line makes the player the new keeper.

There are no villains. The "antagonists" are the storm, the geography and everyone's very reasonable needs.

### Tone
Warm, cosy and gently funny, with short sentences. Nobody shouts except Otto, and Otto shouts happily. The story is all-ages, with no peril, sarcasm or romance. Radio talk adds flavour ("on air", "back on the air") but never gets in the way of meaning.

### Each mechanic, explained in-world
| Chapter | Mechanic | In-world reason |
|---|---|---|
| 1 Main Street | Towers light houses within range. Walls block signal; hills block towers on the ground | Nell's small temporary towers. "Its signal reaches about two tiles all round." Walls and hills are just the town |
| 2 Quiet Hours | Observatories must stay out of every live tower's reach | Juniper's telescopes "listen to the sky", so radio noise ruins them. "Walls and hills make good shade." The meteor shower is coming |
| 3 Rush Hour | Office blocks need two different towers | Otto: one flicker and "the whole office drops the call". Nell's fix is a backup: "If one blinks, the other holds." The two roof lamps are the two signals |
| 4 Point the Dish | Dishes cover a 90 degree cone at long range; turning is free | Nell's old dish from the shed, for the far orchard farms. "A quarter turn of sky, straight out. Turning costs nothing." |
| 5 Relay Run | Towers only work if they link back to the station | Nell switches the real Radio Wren station back on. From now on, towers repeat the real broadcast: "A tower with no link is just a pole in a field." |
| 6 Hall of Mirrors | Panels block direct signal and bounce it once; range counts the whole path | Juniper's spare telescope mirrors, for the narrow, bending Glass Lanes. "The bounce counts the whole trip ... stand close to the panel." |
| 7 Grand Broadcast | Everything mixed | Starfall Night: offices are busy, the observatory needs quiet, and the station feeds the town, all at once |

Why the station rule starts only in chapter 5: in chapters 1 to 4, Nell's towers carry her own test signal. In chapter 5 the real station comes back, and the real broadcast has to be passed tower to tower. Nell says this at the end of chapter 4.

Names used in the story:
- **Wren Hollow** (also "the Hollow"): the town
- **Radio Wren**: the station
- **the Wrenfall**: the meteor shower
- **Starfall Night**: the festival when the town listens to it
- **the Glass Lanes**: the panel district
- **the Pell family**: the orchard farm, mentioned only

---

## 2. Characters

Four speakers plus a narrator. Every portrait is a flat SVG on a 96x96 viewBox inside a ring in the speaker's colour. Each has three moods (`neutral`, `happy`, `worried`), and only the brows, eyes and mouth change between them. The construction is in `design/portrait-*.svg`; build each mood from that file.

Each speaker has one **speaker colour**, used for the portrait ring and the name text. All speaker colours pass 6.7:1 or better on the card's `#26313d` background. Each portrait sits on a ground tinted toward the speaker colour, which keeps dark hair readable.

### Sam: the apprentice (the player)
- **Personality:** eager, earnest and a quick learner. Asks the question the player is thinking.
- **Voice:** few words, plain and curious. "Only one way?" Sam never explains rules; Sam checks them. That keeps the player in charge.
- **Portrait:**
  - beanie in accent teal `#7fe0d0` with a `#e9edf1` pompom
  - skin `#c99a72`, shadow `#b3845e`, brown hair `#5a4636`
  - terracotta jacket `#c47a5a` with `#a5604a` collar
  - grey headphones round the neck: `#d5d9df` cups, `#8d95a1` band
- **Speaker colour:** `#7fe0d0`. Ground `#3a5059`.
- Sam's name is fixed (no name entry). That keeps the text and the Swift port simple. It's a gender-neutral name, and Sam is never gendered in the text.

### Nell: the mentor
- **Personality:** retired signal keeper. Dry, kind and unflappable. Built the first tower with her dad. Proud of the apprentice but won't gush.
- **Voice:** short, practical sentences with a twinkle. Calls Sam "apprentice". Refers to equipment as "she". "Good teachers. Rude, though."
- **Portrait:**
  - white hair in a bun, `#e9edf1` with `#c9d1da` shading
  - skin `#e8c4a0`, shadow `#d4ac87`
  - round glasses `#8d95a1`
  - moss cardigan `#6f8d61` with `#5f7d55` edges, over a `#e6dccb` blouse
  - a warm `#ffd27a` pencil tucked in her hair
- **Speaker colour:** `#ffd27a`. Ground `#4a4b4a`.

### Juniper: the astronomer
- **Personality:** runs the observatory. Gentle, precise and a bit shy, until meteors come up. Then she can't stop.
- **Voice:** soft, with little self-corrections. "Sorry, I whisper. Habit." "I know. I mean, thank you."
- **Portrait:**
  - big dark curly hair `#262c35` with a warm `#ffd27a` star pin
  - skin `#8d6248`, shadow `#76503a`
  - slate coat `#5b6878` and a lilac scarf `#cbbff5` (lilac is the observatory's quiet-zone colour in the game)
- **Speaker colour:** `#cbbff5`. Ground `#4f566c`.

### Otto Briggs: the mayor
- **Personality:** big-hearted, bustling and fond of exclamation marks. Worries out loud, then cheers up in the next breath.
- **Voice:** "Splendid! Simply splendid!" "No pressure!" "Very official." Speaks for the council.
- **Portrait:**
  - round face, skin `#d6a47c`, shadow `#bb8a63`
  - grey side hair and a big moustache `#9aa0a8`
  - rust waistcoat `#a5604a`, cream shirt `#e6dccb`, slate bow tie `#5b6878`
  - gold mayor's sash `#ffd27a`
- **Speaker colour:** `#f0a986`, the only new colour (a light terracotta, 6.75:1 on `#26313d`). Ground `#4c4950`.

### Narrator
The narrator has no portrait and no name. Narrator text is centred, with a small tower glyph above it. It's used only in the prologue and epilogue.

---

## 3. The script (final text)

Every line is final. Moods are in brackets; `neutral` is the default and is left out. A `[focus X]` tag rings the matching tiles on the board while that line shows (see section 6).

**Lengths, checked by script:**
- Dialogue: the longest line is 83 characters (the limit is 90).
- Level lines: the longest is 52 characters (the limit is 60).
- All text is plain ASCII: straight apostrophes, no emojis.

### Prologue: The Night the Tower Fell `prologue`
- Narrator: Wren Hollow, the night after the big storm.
- Nell (worried): Well, that's that. The old tower came down in the wind, and every radio went quiet.
- Nell (worried): No weather, no news, no Radio Wren. Forty years on air, and not a peep tonight.
- Sam: So we build it back up?
- Nell: The big one takes time. We start small. Little towers, house by house.
- Nell (happy): By Starfall Night, every home in the Hollow hears us again. Deal, apprentice?

### Chapter 1, Main Street
**Opening: Main Street** `basics.start`
- Nell: Here's Main Street. See the dark windows? Those folks can't hear a thing. [focus H]
- Nell: Set a tower on the grass. Its signal reaches about two tiles all round.
- Sam: And every house in reach lights up?
- Nell (happy): Every one. Light them all and the street is back on air.

**Mid-chapter: The Mayor Drops By** `basics.mayor` (before level 9)
- Otto (happy): Was that Radio Wren on my kitchen set? Splendid. Simply splendid!
- Otto (worried): Nell, the council is fretting. They say the Hollow can't wait forever for news.
- Nell: Tell the council they'll have it. My apprentice is quick.
- Otto (happy): Then Starfall Night stays on the calendar. All of it on air. No pressure!

**Closing: The Tower Stands** `basics.end` (level 15, "Signal Tower", is the big tower rebuilt)
- Nell (happy): Look at that. The old tower, standing again, and Main Street all lit up.
- Sam (happy): Every window. Even the bakery.
- Nell (happy): Mrs. Tull's been baking by candlelight all week. Expect scones.
- Nell: Now, someone up the hill has been waiting for us. Quietly.

### Chapter 2, Quiet Hours
**Opening: Quiet, Please** `quiet.start`
- Juniper (happy): Oh! Hello. Sorry, I whisper. Habit. I'm Juniper. I run the observatory. [focus Q]
- Juniper (worried): My telescopes listen to the sky. Your radio is lovely, but it is very loud to them. [focus Q]
- Nell: So the observatory stays out of every tower's reach. Not one can touch it.
- Juniper: Walls and hills make good shade. Starfall is coming, and I can't miss it.

**Closing: Listening to Stars** `quiet.end`
- Juniper (happy): Listen. Nothing at all. Just stars. It's perfect.
- Juniper: The Wrenfall comes every autumn. Hundreds of meteors, right over the Hollow.
- Sam: And on Starfall Night, everyone watches?
- Juniper: Everyone listens. Radio Wren calls out every one. Well, it used to.
- Nell (happy): It will again.

### Chapter 3, Rush Hour
**Opening: Rush Hour** `busy.start`
- Otto (happy): Welcome downtown! Phones ringing, kettles boiling, everyone talking at once! [focus B]
- Otto (worried): But if one signal flickers, the whole office drops the call. Chaos!
- Nell: Then each office block gets two different towers. If one blinks, the other holds. [focus B]
- Otto (happy): Two lamps on the roof for two signals. I like it. Very official.

**Closing: Not One Dropped Call** `busy.end`
- Otto (happy): Not a single dropped call all morning. The council is speechless!
- Otto: Well, they're talking a great deal, actually. But happily.
- Nell (worried): Good. Because the orchard farms past the ridge still hear nothing.
- Otto (worried): The orchards? That's a long way out. You'll need something with real reach.

### Chapter 4, Point the Dish
**Opening: The Old Dish** `dish.start`
- Nell (happy): Found her in the shed. My old dish. She reaches far, but only one way. [focus chip:dish]
- Sam: Only one way?
- Nell: A quarter turn of sky, straight out. Tap her to turn her. Turning costs nothing.
- Nell: Out here the little towers won't carry far. Let the dish do the long work.

**Closing: The Orchards Answer** `dish.end`
- Sam (happy): The orchard farms are on! I can hear them cheering from here.
- Nell (happy): That's the Pell family. Loud lot. Bless them.
- Nell: Now for the real test. I'm switching the old station back on.
- Nell: From here on, towers carry the real broadcast. Hand to hand.

### Chapter 5, Relay Run
**Opening: Back on the Air** `relay.start`
- Nell (happy): Radio Wren station, back on the air. Forty years, and she still hums. [focus S]
- Nell: The station is a tower too. But the others must hear it to pass it on. [focus S]
- Sam: So every tower has to link back to the station, through other live towers?
- Nell: Right. A tower with no link is just a pole in a field. No voice at all.

**Mid-chapter: Nell's First Tower** `relay.dad` (before level 30, whose hint is "Hills make good stepping stones")
- Nell: I built the first tower on that hill with my dad. I was younger than you.
- Sam: Did he teach you all this?
- Nell (happy): Most of it. Storms taught me the rest. Good teachers. Rude, though.

**Closing: Mirrors, Juniper?** `relay.end`
- Nell (happy): Hear that? That's the real Radio Wren, in every corner of town.
- Juniper (worried): Nell! The Glass Lanes are still dark. The streets bend too much for signal.
- Juniper: But I have spare telescope mirrors. Big ones. They bounce anything.
- Nell (happy): Mirrors. Juniper, you're a genius.
- Juniper (happy): I know. I mean, thank you.

### Chapter 6, Hall of Mirrors
**Opening: The Glass Lanes** `panel.start`
- Juniper (happy): Here they are. Polished panels from the old telescope. Mind the shine. [focus /L]
- Juniper: A panel blocks signal head-on, but bounces it once, around the corner. [focus /L]
- Nell: The bounce counts the whole trip, there and on. So stand close to the panel.
- Sam (happy): One bounce, round the corner. Got it.

**Closing: The Night Before** `panel.end`
- Sam (happy): That's the last dark street. The Glass Lanes are glowing.
- Juniper (happy): The panels catch the starlight too. Look. The whole lane sparkles.
- Otto (worried): Nell! Apprentice! Starfall Night is tomorrow. Is the Hollow ready?
- Nell: Almost. One last broadcast. Everything at once.

### Chapter 7, Grand Broadcast
**Opening: Starfall Night** `mixed.start`
- Otto (happy): Bunting up, lanterns lit, cocoa on. The whole Hollow is out in the square!
- Juniper (worried): And the observatory still needs quiet skies. The meteors start at nine. [focus Q]
- Nell: Offices want two signals. The observatory wants none. Mind them both.
- Nell (happy): Everything you've learned, apprentice. One night. Let's go.

**Mid-chapter: First Meteor** `mixed.meteor` (before level 37)
- Juniper (happy): First meteor! Did you see it? Right over the ridge!
- Otto (happy): I heard it! On the radio! That's how it's done!
- Nell: Two more streets, apprentice. Then the whole Hollow hears the show.

**Closing: Live from the Hill** `mixed.end`
- Nell (happy): This is Radio Wren, live from the hill. Starfall Night has begun.
- Juniper (happy): Meteor at the ridge. Two by the orchard. Oh, there's a bright one!
- Otto (happy): Every house is listening. Every single one. The council is in tears!
- Sam (happy): We did it, Nell.
- Nell (happy): You did it. I just held the ladder.

### Epilogue: Keeper `epilogue`
- Narrator: Starfall Night, Wren Hollow. Every window warm. Every radio on.
- Otto (happy): The council voted this morning. Radio Wren stays on air. Forever, I told them.
- Juniper (happy): Three hundred and twelve meteors. My best count ever, and not one buzz.
- Nell: I've been thinking. The Hollow needs a signal keeper. A proper one.
- Nell (happy): The tower's yours, keeper. Keep it humming.
- Narrator: Thank you for playing Signal Tower.

---

## 4. Per-level lines

One line per level, shown on the **level postcard** on the map after the first win (section 5). Each is 60 characters or fewer; the longest is 52.

| # | Level | Line |
|---|---|---|
| 1 | First Light | The first window glows. Someone waves a tea towel. |
| 2 | Stone Wall | The garden wall kept the signal out. Not anymore. |
| 3 | Hill Shadow | The house behind the hill hears the weather again. |
| 4 | High Ground | From the hilltop, the signal rolls all the way down. |
| 5 | Into the Woods | The cottages in the woods are humming along. |
| 6 | Old Quarry | The quarry workers' radio crackles back to life. |
| 7 | Crossing | The crossing guard hears the school report. |
| 8 | Long Fence | Both sides of the long fence are on air. |
| 9 | Divided Valley | One valley, two halves, one station. |
| 10 | Back Roads | Nine farmhouses on the back roads, all tuned in. |
| 11 | Ridge Line | The ridge cottages hear the evening songs. |
| 12 | Stone Maze | Every pocket of the maze is listening. |
| 13 | Wide Range | Bigger towers, bigger reach. Main Street is buzzing. |
| 14 | Fortress | Even the old walled lane has news tonight. |
| 15 | Signal Tower | The old tower stands again. The Hollow cheers. |
| 16 | Quiet Please | The observatory hears only stars. |
| 17 | Night Sky | Houses lit, telescope undisturbed. Juniper sighs. |
| 18 | Stargazers | Two domes, two quiet skies. |
| 19 | Deep Field | The hill keeps the deep field dark and still. |
| 20 | Office Hours | Two lamps on the roof. The phones never drop. |
| 21 | Double Shift | The day shift and the night shift both get through. |
| 22 | Overtime | The office works late, and so does the signal. |
| 23 | Downtown | Downtown hums. Otto says "splendid" six times. |
| 24 | First Dish | The dish finds the first orchard farm. |
| 25 | Narrow Beam | One narrow beam, one very happy farmer. |
| 26 | Long Shot | Signal flies down the long lane to the barns. |
| 27 | Crosswind | Two dishes, aimed true. The orchards are on air. |
| 28 | First Relay | Station to tower, tower to home. The chain holds. |
| 29 | Hand to Hand | A quiet tower in the middle carries the voice. |
| 30 | **Pass It On** (was Chain Gang) | Hill to hill, the broadcast steps across town. |
| 31 | Long Haul | From the corner station to the far side of town. |
| 32 | First Bounce | The signal turns its first corner. |
| 33 | Around the Corner | A lane that never had signal hears music. |
| 34 | Glass Garden | Two sealed gardens, both reached by a bounce. |
| 35 | Hall of Mirrors | The Glass Lanes sparkle and sing. |
| 36 | Rush and Hush | Busy offices, quiet dome, side by side. |
| 37 | Mirror Relay | The chain bends round the corner to the square. |
| 38 | Grand Broadcast | Every house in Wren Hollow. Starfall is on air. |

**Rename (one):**
- **Level 30, "Chain Gang" becomes "Pass It On".**
  - Why: "chain gang" refers to convict labour, which is wrong for an all-ages store game. "Pass It On" says what the level teaches.
  - How: change `name` in `tools/levels-src.js` and rerun `node tools/solve.js`. The browser test and any saved-name copy need updating too.
- All other names stay. Level 15, "Signal Tower", now carries the story: it is the night the big tower is rebuilt.

---

## 5. Presentation

### 5.1 Where every trigger fires (Kaden's map-return flow)
Kaden's new flow: **win, then back to the level map, the road fills to the next circle, then tap it to play.** The story sits inside that flow and never adds a screen of its own between levels.

| Trigger | Fires | Backdrop | After it |
|---|---|---|---|
| `prologue` | The first time a fresh save taps **Play** on the start screen, before anything else | `town`: the town hero full-bleed, all layers off (dark) | Continues to whatever Play does (level 1 today) |
| `chapterStart` | The first time the player **enters the first level of a chapter** (levels 1, 16, 20, 24, 28, 32, 36), after the board has loaded and **before** that level's one-time callout tip | `board`: the level, dimmed | The level's existing callout tip, then play |
| `levelStart` (mid-chapter) | The first time the player enters level 9, 30 or 37, before the board is playable | `board` | Play |
| Level line (postcard) | On the map, after the road fill reaches the next node, for **first-time** wins only | The map stays live | Auto-dismisses after 4s, or on tap. Never blocks tapping the next node |
| `chapterEnd` | On the map, after the first win of a chapter's last level (15, 19, 23, 27, 31, 35, 38) | `map`: the map, dimmed | Town card, then the banner opens |
| Town card | Right after a `chapterEnd` scene closes (or is skipped) | Map, dimmed | The chapter banner opens and the road continues to the next chapter's first node |
| `epilogue` | Right after the chapter 7 town card | `town`: the full-bleed hero with every layer on, meteors moving | The ending card |

**The exact order on the map after a chapter's last level** (for example level 19):
1. The win plays on the board as Forge builds it, then the map opens.
2. The road fills from node 19 **up to the Rush Hour banner and pauses there**. The banner stays locked.
3. The level postcard for 19 shows. In this case it's shorter: 2.5s or tap, and the next step starts when it goes.
4. The map dims, and the `quiet.end` scene plays.
5. The town card shows "The observatory dome is open." with the `tl-quiet` layer revealing. It stays until tapped, for at least 1.2s.
6. The dim lifts. The banner opens (the existing banner animation), the road continues to node 20, and node 20 pulses.
7. The player taps node 20. The board loads and `busy.start` plays over it, then the level 20 callout tip, then play.

After level 38 there is no next node, so the road fills to the road's end. Then: postcard, `mixed.end`, town card (festival), `epilogue` over the full-bleed town, then the **ending card**:
- "Wren Hollow is on air." (title)
- "All 38 levels connected." (muted)
- buttons [Story] [Level map]
- It returns to the start screen, which already shows "Play again".

**One scene per moment.** Never queue two scenes back to back, except the fixed chapter 7 chain above (closing, town card, epilogue). If two scenes ever want the same moment, play the later one and mark the other seen. It stays in the Story log.

**Replays don't retrigger.** Replaying a beaten level never plays its `levelStart` or `chapterStart` scene or its postcard again. Replaying the last level of a chapter never replays the chapter end.

### 5.2 The dialogue card
See `dialogue-card-phone.svg` and `dialogue-card-desktop.svg`.

**Layers, bottom to top:**
1. The backdrop: board, map or town.
2. A dim of `rgba(12,18,26,0.55)`, full screen.
3. An optional focus ring: a 3px ring in the speaker colour at 0.72 of the tile size, plus an outer ring at 0.92 and 50% opacity, on every tile that matches the line's `focus`. `chip:dish` rings the tray chip instead, using the existing `callout-ring`.
4. The top-right control row:
   - **Fast forward**: a 44x44 round button with a double-chevron icon, `aria-pressed`.
   - **Skip**: a 92x44 pill, "Skip" plus a skip-to-end icon.
   - Both are `rgba(38,49,61,0.94)` with a 1px `#3b4858` border and 15px/700 `#e9edf1` text.
   - They sit at top `12px + safe-top`, right 16px, with a 10px gap.
5. The card.

**The card:**
- Fill `#26313d` at 0.98, 1px `#3b4858` border, radius 20.
- Shadow `0 6px 0 rgba(6,10,16,0.35)` plus the existing `--shadow`.
- Header:
  - Portrait, then the **name** (uppercase, weight 800, `letter-spacing: 0.08em`, in the speaker colour).
  - Then the **role** (muted `#9aa7b5`, weight 600).
  - The name is always text, so the speaker never depends on colour alone.
- Text: `#e9edf1`, weight 500.
- Footer:
  - **Line dots** bottom left. Done and upcoming dots are 6px `#4a5868`; the current one is a 16x6 accent pill.
  - **Next chevron** bottom right: accent, 2.6px stroke, shown once the line is fully typed.
- **Narrator lines:** no portrait or name. A small tower glyph (two mast legs `#e8ebef`, accent beacon) sits above centred text. Same card size.

| | Phone portrait 390x844 | Phone landscape 844x390 | Desktop 1280x800 |
|---|---|---|---|
| Card | x 16, width `100vw - 32` (358), height 170 | width 560, centred, height 136 | width 760, centred, height 172 |
| Bottom | 16 + safe-bottom | 12 + safe-bottom | 32 |
| Portrait | 76, overlaps the card top by half; left 18 | 56, inline at left 16 / top 16 | 88, overlaps the top by half; left 18 |
| Name / role | 15px name, 12px role on a second line, right of the portrait | 13px name, 12px role on the same line | 17px name, 14px role on a second line |
| Text | 17/25, up to 3 lines, under the header | 16/23, up to 2 lines, right of the portrait | 19/28, up to 2 lines |
| Text box | full card width, 24px padding | card width minus portrait (432) | full width, 24px padding |

- **The card never changes height between lines.** Its height is set for the maximum line count, so the card doesn't jump.
- At larger text sizes the card may grow **upward** up to 5 lines, then the text scrolls inside it.
- **Placement rule:** if a focus tile would sit under the card, the card moves to the top of the screen (top `68px + safe-top`, under the control row) for that line, with a 200ms slide.
- **The tray** is dimmed under the dim layer and can't be used while a scene plays. The whole screen is the scene.

### 5.3 Controls
- **Tap anywhere** (card or dim): if the line is still typing, finish it. Otherwise go to the next line. After the last line, close the scene.
- **Hold anywhere for 400ms** turns on fast forward while held (the same as the button).
- **Fast forward:**
  - Typing runs at 4x.
  - Each line auto-advances 500ms after it finishes.
  - The button toggles it on and stays on until pressed again or the scene ends. It is not remembered across scenes.
- **Skip:** ends the scene at once and marks it seen. No confirm dialog: it can always be replayed from the log.
- **Keyboard:**
  - Enter or Space: next
  - Esc: skip
  - F: toggle fast forward
  - Hold Space for 400ms: fast forward while held
  - The game's own keys (Z, R, H and so on) are ignored while a scene plays.
- **Sound:** a soft new `line` blip on each advance (sine at about 660Hz, 40ms, low volume). There is no per-letter typing sound. It follows the mute setting.

### 5.4 Level postcard (map)
See `story-map-flow.svg`, frame A.
- Sits above the CTA bar, centred: width `min(COL, 340px)`, height 88, radius 16.
- Fill `rgba(38,49,61,0.97)` with a 1px `#3b4858` border.
- Left: a 40px `#303c4a` circle with a small lit house: wall `#e6dccb`, roof `#c47a5a`, two `#ffd27a` windows.
- Text:
  - Line 1: "LEVEL 3, HILL SHADOW" (11px/700 uppercase, muted, `letter-spacing: 0.08em`).
  - Line 2: the level line (14px/600, `#e9edf1`, up to 2 lines).
- Motion:
  - Rises 16px and fades in over 220ms. Holds 4s (2.5s before a chapter end). Fades out over 200ms.
  - A tap dismisses it.
- It gets `role="status"` and is read once.
- It never blocks taps on the map. The node, CTA and scroll all work while it shows.
- **Landscape:** the same card, 72px tall, sitting above the 48px CTA.

### 5.5 Town card (map) and the start screen
See `story-map-flow.svg` frame B, `town-hero.svg` and `town-changes.svg`.
- **Town card:**
  - Centred, 324 wide (phone) or 380 wide (desktop), radius 22, `#26313d`, 1px `#3b4858`.
  - Contents, top to bottom:
    - an eyebrow: "WREN HOLLOW GROWS" (11px/800, warm, `letter-spacing: 0.12em`)
    - the town hero at 292x198 (phone) or 340x232 (desktop), radius 12, showing every layer earned so far
    - the newly earned layer, playing its `reveal` animation
    - a caption: the `town[].caption` (17px/700)
    - "<Chapter name> is connected." (14px, muted)
    - "Tap to continue" (12px/700, accent)
  - Landscape: the hero is on the left (260x177) and the text on the right. The card is 560x220.
- **The start screen** uses `town-hero.svg` in place of `title-hero.svg`, with the same size and position rules as today.
  - On load, add class `on` to `.tl-<chapter>` for every chapter whose closing scene has been seen.
  - The first time the start screen shows after a layer was earned, that layer also gets `reveal` (the 900ms brighten-in). The save keeps `story.townShown` so this plays once.
- **What changes, chapter by chapter.** Before a chapter is finished, its landmark sits in the scene as a dark silhouette (`#26313d`, `#1f2832`, unlit windows `#3a4552`), so players can see what's still to come.

| Layer | Landmark (off: silhouette) | On |
|---|---|---|
| `tl-basics` | Three small Main Street houses on the far left horizon | Cream walls, terracotta roofs, warm windows, a soft warm glow |
| `tl-quiet` | Observatory dome on the far left | `#dfe3e8` walls and a `#c3ccd6` dome, slit open with a telescope, a dashed lilac quiet ring, three sparkles |
| `tl-busy` | Office block at the right edge | `#c9d1da` walls, warm window grid, two lit roof lamps with halos |
| `tl-dish` | Dish and barn on the right ridge | Dish `#e8ebef` facing out toward the orchards, a faint teal beam, a lit barn window |
| `tl-relay` | Station house on the near hill, right of the tower | `#d8cfc0` walls, `#5b6b7c` roof, teal antenna light, a dashed teal link to the tower |
| `tl-panel` | Two panel slabs in front of the tower | `#dfe8ee` faces with `#9fb3c2` edges, and sparkles |
| `tl-mixed` | (none) | Bunting in four palette colours strung from the houses to the tower, and three meteors crossing the sky |

- **The level map:** the existing roadside houses already light up per level. In addition:
  - Each chapter banner whose chapter is finished gets a 2px warm `#ffd27a` border and a small "Connected" tag (11px/700 warm) under the chapter name.
  - Tapping a finished or open banner replays that chapter's opening scene.

### 5.6 Animation

| What | Timing |
|---|---|
| Scene in | The dim fades 0 to 0.55 over 200ms. The card rises 24px and fades in over 260ms with `cubic-bezier(.2,.8,.2,1)`, 60ms after the dim starts. The portrait scales 0.9 to 1 over 160ms, 80ms after that |
| Typing | About 40 characters a second (25ms per character). Extra pause: 60ms after a comma, 140ms after `.`, `!` or `?` |
| Next line, same speaker | The text clears and types again. The portrait swaps mood with a 120ms crossfade |
| Next line, new speaker | The portrait and name crossfade over 150ms. The card itself doesn't move |
| Chevron | Bobs 3px over 1s, ease-in-out, infinite, once the line is typed |
| Focus ring | Scales 1.15 to 1 over 220ms on entry, then gently pulses opacity between 1 and 0.6 every 1.6s |
| Scene out | The card drops 16px and fades over 200ms, and the dim fades over 200ms |
| Postcard | In 220ms, hold 4s, out 200ms |
| Town card | Scales 0.94 to 1 over 260ms. The new layer reveals over 900ms (`tl-in`), 300ms after the card lands |
| Meteors (`tl-mixed`) | Three streaks on a 7s loop, staggered 0s, 2.4s and 4.6s |
| Epilogue backdrop | The town hero scales from 1.04 to 1 over 6s (a slow settle), with everything lit |

### 5.7 Accessibility
- **Readable sizes:** body text is never under 16px. Lay it out in `rem`, so browser and iOS text-size settings scale it, and the card grows upward as described in 5.2.
- **Contrast:**
  - Body text `#e9edf1` on `#26313d`: 11.2:1
  - Muted text: 5.4:1
  - Speaker names: Sam 8.5, Nell 9.3, Juniper 7.8, Otto 6.8 (all to 1)
- **Not colour alone:** the speaker is always named in text, and focus rings are shapes.
- **Reduced motion:**
  - no typing (the whole line appears at once)
  - no rise or slide: opacity fades of 150ms only
  - no chevron bob or focus pulse
  - town layers switch on without the brighten
  - meteors are drawn as still streaks
  - the epilogue backdrop doesn't zoom
  - fast forward still works: it just auto-advances
- **Screen readers:**
  - The scene container has `role="dialog"`, `aria-modal="true"` and `aria-label="Story: <scene title>"`.
  - Focus moves into it on open (onto the card), stays trapped inside, and returns to where it was on close.
  - The card is a `<button>` with an `aria-label` such as "Next line, 2 of 4".
  - The line text sits in an `aria-live="polite"` region that receives the **whole line** as soon as the line starts, as "Nell: Here's Main Street ...". The typed-out visible text is `aria-hidden="true"`, so readers never hear it letter by letter.
  - Portraits are decorative (`aria-hidden`); the name is in the live text.
  - Skip: `aria-label="Skip scene"`. Fast forward: `aria-label="Fast forward"` with `aria-pressed`.
  - The postcard is `role="status"`.
  - The town card is a dialog with its caption as its label.
  - On iOS, map these one to one to VoiceOver labels and `UIAccessibility.post(.announcement)`.
- **Settings:**
  - **Story scenes: On / Off.** Off means scenes, postcards and town cards don't play automatically, but town layers still switch on and everything is in the Story log.
  - **Text speed: Normal / Fast / Instant.** Fast is 2x. Instant shows whole lines.

### 5.8 The Story log
- **Where it opens:**
  - a book icon button in the map header, between the title and the star pill. It's a new `i-book` symbol: two open pages, 2px stroke.
  - a "Story" row in the pause menu
  - the ending card
- **Layout:** the same layout as Settings. Grouped by chapter, with the prologue first and the epilogue last.
- **Rows:**
  - Each row shows the scene title (16px/700) and, on a second line, where it plays, such as "Before level 9" or "Chapter 2 opening" (12px muted).
  - Seen scenes have **Play** and **Read** buttons, each 44x44.
  - Unseen scenes show a lock and "Reach level N" (muted), with no buttons.
  - Scenes skipped before they finished count as seen.
- **Read** opens a scrolling transcript, "Name: line" one per line. It's good for accessibility and for re-reading quickly.
- **Play** replays the scene over the town backdrop (the start-screen hero at the player's current town state, dimmed). Replays never change the save.
- **Level lines** are not in the log. They show on hover or focus in each beaten node's name pill as a second line, in muted 12px.

---

## 6. Data format (`js/story.js`)

Plain JSON-compatible data only: no functions, comments or computed values inside the object. It ports to Swift `Codable` unchanged. The full file is `design/story-data.json`; Forge wraps it as `window.STORY = { ... };` (and `module.exports` under Node, for tests).

```json
{
  "version": 1,
  "speakers": {
    "narrator": { "name": "", "role": "", "color": "#e9edf1", "portrait": null },
    "nell": { "name": "Nell", "role": "Signal keeper", "color": "#ffd27a", "portrait": "nell" }
  },
  "scenes": [
    {
      "id": "quiet.start",
      "title": "Quiet, Please",
      "chapter": "quiet",
      "trigger": { "type": "chapterStart", "chapter": "quiet" },
      "backdrop": "board",
      "lines": [
        { "id": "quiet.start.1", "speaker": "juniper", "mood": "happy", "text": "Oh! Hello. ...", "focus": "Q" }
      ]
    }
  ],
  "levelLines": { "1": "The first window glows. Someone waves a tea towel.", "...": "..." },
  "town": [ { "chapter": "quiet", "layer": "tl-quiet", "caption": "The observatory dome is open.", "chapterName": "Quiet Hours" } ],
  "renames": { "30": { "from": "Chain Gang", "to": "Pass It On" } }
}
```

**Fields:**
- `trigger.type` is one of these:
  - `prologue`
  - `chapterStart` (`chapter`)
  - `chapterEnd` (`chapter`)
  - `levelStart` (`level`, 1-based)
  - `levelWin` (`level`; supported but unused today, so future scenes can play after a specific win, at the postcard moment and replacing the postcard)
  - `epilogue`
- Chapter ids match `CHAPTERS` in `game.js`: `basics`, `quiet`, `busy`, `dish`, `relay`, `panel`, `mixed`.
- `backdrop` is `town`, `board` or `map`. It's the default for that trigger and is stated explicitly, so Swift doesn't need the rule.
- `mood` is `neutral` (default, left out), `happy` or `worried`.
- `focus` is optional. It's a map legend character, rung on every matching tile: `H`, `Q`, `B`, `S`, `/L` (both panel kinds), `#`, `^` or `T`. Or it's `chip:dish` / `chip:mast` for a tray chip. If there's no match on the board, it does nothing.
- `levelLines` is keyed by 1-based level number as a string, because JSON object keys are strings.
- **Every line has a stable `id`** (`<scene id>.<n>`). Use it as the localisation key later, in a String Catalog on iOS. Don't reuse an id for different text. If a line is rewritten, keep the id; if a line is added, give it a new id.

**Swift sketch for the port** (for reference, not for Forge now):
```swift
struct Story: Codable { let version: Int; let speakers: [String: Speaker]; let scenes: [Scene]; let levelLines: [String: String]; let town: [TownLayer] }
struct Speaker: Codable { let name: String; let role: String; let color: String; let portrait: String? }
struct Scene: Codable { let id, title, chapter, backdrop: String; let trigger: Trigger; let lines: [Line] }
struct Trigger: Codable { let type: String; let chapter: String?; let level: Int? }
struct Line: Codable { let id, speaker, text: String; let mood: String?; let focus: String? }
struct TownLayer: Codable { let chapter, layer, caption, chapterName: String }
```
The portraits and town layers are SVG drawn in code. On iOS, either rebuild them as SwiftUI `Shape`s from the same coordinates, or render the SVGs to PDF assets at build time. Either way, no text is baked into an image.

**Checks Forge adds to `tests/logic.test.js`** (I ran the same checks on the data):
- every line is 90 characters or fewer; every level line is 60 or fewer
- every speaker exists
- every trigger type, chapter and level is valid
- every chapter has one `chapterStart` and one `chapterEnd`
- there are 38 level lines
- ids are unique
- all text is printable ASCII (no emojis or smart quotes)

---

## 7. Save and flow

### Save shape
A new optional field is added to the existing progress object and validated the same way as `seen`:
```json
"story": { "seen": { "prologue": true, "basics.start": true }, "townShown": ["basics"], "offered": true, "on": true, "speed": "normal" }
```
- `seen`: scene ids that have played to the end or been skipped. A scene is marked seen **when it closes**. If the app is closed mid-scene, it plays again next time.
- `townShown`: chapters whose layer has already revealed on the start screen.
- `offered`: the catch-up offer has been shown (see below).
- `on` and `speed` are the settings.
- Damaged or missing fields fall back to their defaults: `{}`, `[]`, `false`, `true`, `"normal"`.

### Rules
- Each scene plays automatically **once**. Replays come from the Story log or a chapter banner.
- Every scene can be skipped at any moment with one tap.
- A scene is unlocked in the log once its trigger moment has passed. For example, `basics.mayor` unlocks once level 9 has been entered or beaten.

### Players with existing progress
When a save has no `story` field (anyone who played before this update), Forge builds it **silently** on load:
1. Mark these as **seen**:
   - `prologue`, if any level is beaten
   - each `chapterStart` whose chapter's first level is beaten
   - each `levelStart` scene whose level is beaten
   - each `chapterEnd` whose chapter's last level is beaten
   - `epilogue`, if level 38 is beaten
2. Set `townShown` to every finished chapter. Their layers appear lit straight away, with no reveal animation.
3. Leave `offered: false`.

**What they see:**
- **No scenes are forced on them.** They aren't sent back through anything.
- The start screen already shows their town lit up to their progress.
- The first time they open the level map after the update, a one-time **catch-up card** appears. It uses the town-card style: the town hero at their current state, eyebrow "NEW: THE STORY OF WREN HOLLOW", body "Wren Hollow has a story now. Want the story so far?", and two buttons:
  - **Story so far (about 2 min)** plays the prologue and then the closing scene of every finished chapter, back to back, as one skippable sequence. Skip ends the whole sequence.
  - **Later** closes the card. Everything stays in the Story log.

  Either button sets `offered: true`.
- After that, the story picks up naturally at the next unseen trigger:
  - A player on level 21 sees `busy.end` after beating 23.
  - A player who hasn't started level 20 sees `busy.start` when entering it.
  - A player who has finished everything sees only the catch-up card, and the epilogue is in the log.
- Players who replay old levels never trigger old scenes. Scenes fire on first entry or first win only, and those are already past.

### New players
1. Play
2. Prologue
3. Level 1 loads; `basics.start`; then the level 1 callout tip
4. Win, map, road fill, postcard; tap node 2
5. The same rhythm continues, with `basics.mayor` before level 9
6. After level 15: `basics.end`, town card, the banner opens

That's about 60 seconds of story before the first move, all of it skippable, and the rest of the story is spread across the chapters.

---

## What Probe should check visually
- Screenshots at 1280x800, 390x844 and 844x390 of:
  - the prologue
  - a `chapterStart` with a focus ring
  - the postcard
  - the town card
  - the start screen with three or more layers on
  - the ending card
  - the Story log
- The card never covers a focus tile.
- The card height doesn't change between lines.
- 3-line text fits on 390 wide; 2-line text fits on 844x390 and desktop.
- Names are readable, portraits are crisp at 56, 76 and 88px, and nothing is clipped by the safe areas.
- Reduced motion: no typing or movement, and the meteors are still.
- Screen reader: the live region reads each whole line once.
- Saves:
  - an old save (for example 20 levels beaten) gets no forced scenes, plus the catch-up card once
  - a fresh save sees the prologue once
  - replaying levels 1, 9 and 15 triggers nothing
- No console errors. All text matches `story-data.json` exactly.

— Iris, Designer
