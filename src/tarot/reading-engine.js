import { createRandom } from './random.js';
import { drawCards, chooseCurseCount, POSITIONS } from './draw.js';
import { assignCurses } from './curse-engine.js';
import { generateNarrative } from './narrative-engine.js';
import { split } from '../data/values.js';

export const CONTEXTS = Object.freeze(['love', 'career', 'self', 'choice', 'unknown']);

export function createReading({ context = 'unknown', seed, data }) {
  if (!data) throw new Error('createReading requires loaded tarot data');
  if (!CONTEXTS.includes(context)) throw new Error(`Invalid context "${context}". Allowed: ${CONTEXTS.join(', ')}`);
  const random = createRandom(seed);
  const drawn = drawCards(data.cards.filter((card) => card.arcana === 'major'), 3, random);
  const curseCount = chooseCurseCount(random);
  const curses = assignCurses(drawn, curseCount, data.curses, random);
  const resolvedCards = drawn.map((card, index) => {
    const contextual = data.contexts.find((row) => row.card_id === card.id && row.context === context);
    const positioned = data.positions.find((row) => row.card_id === card.id && row.position === POSITIONS[index]);
    if (!contextual || !positioned) throw new Error(`Missing meaning for ${card.id}/${context}/${POSITIONS[index]}`);
    const curse = curses[index];
    return {
      position: POSITIONS[index], cardId: card.id, cardName: card.name,
      isCursed: Boolean(curse), curse, curseId: curse?.id ?? null, themes: split(card.themes),
      meaning: contextual.meaning, positionMeaning: positioned.meaning, curseMeaning: null,
    };
  });
  const id = seed === undefined ? `reading-${Date.now().toString(36)}` : `reading-${String(seed)}`;
  const narrative = generateNarrative(resolvedCards, context, data, { seed: seed ?? id });
  const cards = resolvedCards.map((card, index) => {
    const dynamic = narrative.storyAnalysis.curseDynamics.find((item) => item.cardId === card.cardId);
    const curseName = card.curse?.name;
    return {
      ...card,
      displayThemes: [...narrative.cards[index].themes],
      curseDistortion: dynamic ? `${data.theme_labels[dynamic.primaryTheme]} → ${curseName}` : null,
    };
  });
  const reading = {
    id, context, curseCount, curseLevel: curseCount, cards,
    themeMap: narrative.themeMap,
    relationships: narrative.relationships,
    dominantTheme: narrative.dominantTheme,
    storyAnalysis: narrative.storyAnalysis,
    narrative,
  };
  return reading;
}
