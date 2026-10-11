import { choose } from './random.js';
import { split } from '../data/values.js';

export function assignCurses(cards, count, curses, random) {
  if (count < 1 || count > cards.length) throw new Error('Curse count must be between 1 and the number of cards');
  const order = cards.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const byId = new Map(curses.map((curse) => [curse.curse_id, curse]));
  const result = cards.map(() => null);
  for (const index of order.slice(0, count)) {
    const compatible = split(cards[index].compatible_curses).map((id) => byId.get(id)).filter(Boolean);
    const curse = choose(compatible.length ? compatible : curses, random);
    result[index] = { id: curse.curse_id, name: curse.name, curseLevel: count };
  }
  return result;
}
