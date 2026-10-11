import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTarotData } from '../src/data/loader.js';
import { createReading } from '../src/tarot/reading-engine.js';
import { assignCurses } from '../src/tarot/curse-engine.js';

const data = await loadTarotData();

test('reading has three unique cards with ordered positions', () => {
  const reading = createReading({ context: 'love', seed: 12345, data });
  assert.equal(reading.cards.length, 3);
  assert.equal(new Set(reading.cards.map((card) => card.cardId)).size, 3);
  assert.deepEqual(reading.cards.map((card) => card.position), ['past', 'present', 'future']);
});

test('curse counts are always at least one and consistent over many seeds', () => {
  for (let seed = 0; seed < 500; seed++) {
    const reading = createReading({ context: 'unknown', seed, data });
    const actual = reading.cards.filter((card) => card.isCursed).length;
    assert.ok(actual >= 1 && actual <= 3);
    assert.equal(actual, reading.curseCount);
    assert.equal(reading.curseLevel, actual);
  }
});

test('same seed reproduces the same reading and all meanings resolve', () => {
  const first = createReading({ context: 'love', seed: 9876, data });
  const second = createReading({ context: 'love', seed: 9876, data });
  assert.deepEqual(first, second);
  for (const card of first.cards) {
    assert.ok(card.meaning);
    assert.ok(card.positionMeaning);
    if (card.isCursed) assert.ok(data.curses.some((curse) => curse.curse_id === card.curse.id));
  }
});

test('context is restricted to the five supported values', () => {
  assert.throws(() => createReading({ context: 'work', data }), /Invalid context/);
  assert.equal(createReading({ data }).context, 'unknown');
});

test('curse assignment falls back to valid global curse data', () => {
  const card = { compatible_curses: '' };
  const assigned = assignCurses([card], 1, data.curses, () => 0)[0];
  assert.ok(data.curses.some((curse) => curse.curse_id === assigned.id));
});
