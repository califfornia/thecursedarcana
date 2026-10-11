import { choose } from './random.js';

export function drawCards(deck, count = 3, random = Math.random) {
  if (deck.length < count) throw new Error(`Deck must contain at least ${count} cards`);
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function chooseCurseCount(random, distribution = CURSE_DISTRIBUTION) {
  const roll = random();
  return roll < distribution.one ? 1 : roll < distribution.one + distribution.two ? 2 : 3;
}

export const CURSE_DISTRIBUTION = Object.freeze({ one: 0.70, two: 0.25, three: 0.05 });
export const POSITIONS = Object.freeze(['past', 'present', 'future']);
export { choose };
