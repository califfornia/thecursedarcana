# Anima — The Cursed Arcana

A local, data-driven Tarot Engine for the 22 Major Arcana, implemented in plain JavaScript.

## Run it

```sh
npm test
npm run dev
```

Open <http://127.0.0.1:5175> for the browser demo. To generate and print a seeded reading in the terminal, run `node src/main.js love 12345` (the context can be `love`, `career`, `self`, `choice`, or `unknown`).

In the browser, choose a theme and start a reading as usual. After the reveal, close the results dialog and click the scene to draw again with the selected theme; the Tarot Engine supplies the real cards and the Rive scene animates them. Opening `myproject/scene.rml` directly in the Rive previewer instead plays the scene's built-in sample reading, including local shader effects.

After changing the Rive scene, run `python3 myproject/export-web.py` to rebuild `web/assets/myproject.riv`. The export keeps the scene animations and reading controls but removes local shader scripts, which are not supported by the unsigned browser build.

When a cursed card is revealed, the browser plays the supplied glitch effect from `web/assets/cursed-glitch.mp3`. The Rive scene emits this event only for cursed-card reveal states.

When a normal card is revealed, the browser plays the supplied magic effect from `web/assets/normal-card-magic.mp3`. Normal and cursed reveal states emit separate events and play their corresponding sounds.

The scene background music in `web/assets/arcana-background-music.mp3` loops after the first user interaction that enables playback (normally, beginning a reading). The speaker control in the top-right corner lets the user adjust the volume or mute and restore it.

The engine API takes loaded JSON data:

```js
import { loadTarotData } from './src/data/loader.js';
import { createReading } from './src/tarot/reading-engine.js';

const data = await loadTarotData();
const reading = createReading({ context: 'love', seed: 12345, data });
```

With the same data, context, and seed, the complete result is reproducible. Omitting context selects `unknown`; omitting seed uses `Math.random`.

## Data flow and curse rules

`loadTarotData()` reads the existing root-level JSON exports plus `data/theme_relations.json` and `data/theme_labels.json`. It validates card IDs, references, all 22 × 5 context meanings, all 22 × 3 position meanings, curse compatibility IDs, theme labels, relationship schema, and required narrative templates. The Major Arcana currently use 58 unique themes and the relation dataset contains 58 conceptual pairs. Card `themes` and `compatible_curses` are pipe-delimited in the source and become arrays/lookups inside the engine.

`createReading()` shuffles a copied Major Arcana deck, takes three unique cards, assigns them past/present/future, and samples a curse count using the configurable 70% / 25% / 5% distribution for one / two / three cursed cards. Curse positions are randomized, compatible curse IDs are preferred, and the global curse dataset is the fallback. Every reading has at least one curse; `curseCount` equals `curseLevel` (1–3).

The narrative engine resolves theme labels, prioritizes curse/theme distortions, then compares themes between past/present, present/future, and past/future. It returns at most two relationships and uses a weighted dominant theme as a neutral fallback. Context and position meanings stay on each narrative card; the browser displays short theme labels on the card UI and the detailed prose once in `YOUR READING`. Curse-aware closing variants are selected deterministically from the reading seed.

The structured result exposes `cardId`, `position`, `curseId`, `isCursed`, raw `themes`, readable `displayThemes`, `themeMap`, `relationships`, `dominantTheme`, `context`, `curseCount`, and `curseLevel`. The browser presentation renders the three cards and the complete narrative directly from this result.
