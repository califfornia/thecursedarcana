import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTarotData, validateTarotData, split } from '../src/data/loader.js';
import { createReading } from '../src/tarot/reading-engine.js';
import { findThemeRelation, generateNarrative, getDisplayThemes } from '../src/tarot/narrative-engine.js';

const data = await loadTarotData();
const allCardThemes = new Set(data.cards.flatMap((card) => split(card.themes)));
const cardFor = (id, position, curseId = null, context = 'love') => {
  const source = data.cards.find((card) => card.id === id);
  const curseData = curseId && data.curses.find((curse) => curse.curse_id === curseId);
  return {
    position,
    cardId: source.id,
    cardName: source.name,
    isCursed: Boolean(curseData),
    curse: curseData ? { id: curseData.curse_id, name: curseData.name } : null,
    themes: split(source.themes),
    meaning: data.contexts.find((row) => row.card_id === id && row.context === context).meaning,
    positionMeaning: data.positions.find((row) => row.card_id === id && row.position === position).meaning,
  };
};

test('actual Major Arcana themes all have labels and relations refer to real themes', () => {
  assert.equal(allCardThemes.size, 58);
  assert.equal(Object.keys(data.theme_labels).length, 58);
  assert.ok(data.theme_relations.every((relation) => allCardThemes.has(relation.theme_a) && allCardThemes.has(relation.theme_b)));
  assert.equal(data.theme_relations.length, 58);
});

test('theme relation lookup is symmetrical and detects required semantic pairs', () => {
  assert.equal(findThemeRelation('agency', 'illusion', data.theme_relations)?.type, 'distortion');
  assert.equal(findThemeRelation('illusion', 'agency', data.theme_relations)?.type, 'distortion');
  assert.equal(findThemeRelation('intuition', 'illusion', data.theme_relations)?.type, 'confusion');
  assert.equal(findThemeRelation('new_beginning', 'uncertainty', data.theme_relations)?.type, 'tension');
  assert.equal(findThemeRelation('abundance', 'uncertainty', data.theme_relations), undefined);
});

test('display themes are labeled and relation relevance changes their order', () => {
  const magician = cardFor('major_01', 'past', 'illusion');
  assert.deepEqual(getDisplayThemes(magician, data.theme_labels, ['agency']), ['agency', 'creation']);
  assert.ok(getDisplayThemes(magician, data.theme_labels).every((label) => !label.includes('_')));
});

test('theme validation rejects missing labels, duplicate IDs, and duplicate unordered pairs', () => {
  const missingLabel = structuredClone(data);
  delete missingLabel.theme_labels.new_beginning;
  assert.throws(() => validateTarotData(missingLabel), /Missing human-readable label/);

  const duplicateId = structuredClone(data);
  duplicateId.theme_relations.push({ ...duplicateId.theme_relations[0] });
  assert.throws(() => validateTarotData(duplicateId), /Duplicate theme relation ID/);

  const duplicatePair = structuredClone(data);
  duplicatePair.theme_relations.push({ ...duplicatePair.theme_relations[0], id: 'rel_duplicate' });
  assert.throws(() => validateTarotData(duplicatePair), /Duplicate unordered theme pair/);
});

test('example reading reports a real curse distortion and present-to-future tension', () => {
  const cards = [
    cardFor('major_01', 'past', 'illusion'),
    cardFor('major_00', 'present', 'illusion'),
    cardFor('major_18', 'future'),
  ];
  const narrative = generateNarrative(cards, 'love', data, { seed: 2468 });
  assert.ok(narrative.storyAnalysis.curseDynamics.some((item) => item.curseId === 'illusion' && item.affectedThemes.includes('agency')));
  assert.ok(narrative.relationships.length <= 2);
  assert.match(narrative.opening, /new beginnings|creation|agency/);
  assert.match(narrative.synthesis, /Illusion|illusion/);
  assert.doesNotMatch(`${narrative.opening} ${narrative.synthesis}`, /new_beginning/);
});

test('a curse without a matching theme relation retains its context-specific meaning', () => {
  const cards = [
    cardFor('major_21', 'past', 'attachment'),
    cardFor('major_17', 'present'),
    cardFor('major_09', 'future'),
  ];
  const narrative = generateNarrative(cards, 'love', data, { seed: 3 });
  const past = narrative.cards[0];
  assert.ok(past.curseSummary.includes('A bond may be difficult to release'));
  assert.ok(narrative.storyAnalysis.curseDynamics.some((dynamic) => dynamic.curseId === 'attachment' && dynamic.distortionType === 'connection_becomes_clinging'));
});

test('Fool, Temperance, Star form a beginning, present stagnation, and recurring healing arc', () => {
  const cards = [
    cardFor('major_00', 'past'),
    cardFor('major_14', 'present', 'stagnation'),
    cardFor('major_17', 'future'),
  ];
  const narrative = generateNarrative(cards, 'love', data, { seed: 314 });
  const analysis = narrative.storyAnalysis;
  const dynamic = analysis.curseDynamics.find((item) => item.position === 'present');

  assert.equal(analysis.arc.past.role, 'origin');
  assert.equal(analysis.arc.present.role, 'central_focus');
  assert.equal(analysis.arc.future.role, 'emerging_direction');
  assert.equal(dynamic.curseId, 'stagnation');
  assert.equal(dynamic.distortionType, 'patience_becomes_inaction');
  assert.deepEqual(dynamic.affectedThemes, ['patience', 'balance']);
  assert.equal(dynamic.narrativeRole, 'central_distortion');
  assert.ok(analysis.continuities.some((item) => item.themes.includes('healing') && item.positions.includes('present') && item.positions.includes('future')));
  assert.match(narrative.opening, /new beginnings/);
  assert.match(narrative.opening, /balance/);
  assert.match(narrative.opening, /healing/);
  assert.match(narrative.opening, /hope/);
  assert.equal(narrative.storyAnalysis.openingThemes.length, new Set(narrative.storyAnalysis.openingThemes).size);
  assert.match(narrative.synthesis, /balance/);
  assert.match(narrative.synthesis, /Stagnation/);
  assert.match(narrative.synthesis, /healing/);
  assert.match(narrative.synthesis, /hope/);
  assert.doesNotMatch(narrative.opening, /healing.*healing/i);
  assert.ok(narrative.transitions.length === 2 && narrative.transitions.every((item) => item.text));
});

test('500 seeded readings remain complete, deterministic, and free of raw compound IDs', () => {
  const contexts = ['love', 'career', 'self', 'choice', 'unknown'];
  for (let seed = 0; seed < 500; seed++) {
    const context = contexts[seed % contexts.length];
    const first = createReading({ context, seed, data });
    const second = createReading({ context, seed, data });
    assert.deepEqual(first, second);
    assert.equal(first.cards.length, 3);
    assert.equal(new Set(first.cards.map((card) => card.cardId)).size, 3);
    assert.ok(first.curseCount >= 1);
    assert.equal(first.curseCount, first.cards.filter((card) => card.isCursed).length);
    assert.equal(first.curseLevel, first.curseCount);
    assert.ok(first.relationships.length <= 2);
    const userText = [first.narrative.opening, ...first.narrative.cards.flatMap((card) => [card.summary, card.story, card.curseSummary ?? '']), ...first.narrative.relationships.map((relation) => relation.text), first.narrative.synthesis, first.narrative.closing].join(' ');
    assert.doesNotMatch(userText, /\b[a-z]+_[a-z_]+\b/i);
    assert.doesNotMatch(userText, /undefined|null/);
    assert.ok(first.narrative.opening && first.narrative.synthesis && first.narrative.closing);
    assert.ok(first.narrative.cards.every((card) => card.summary && card.story && card.themes.length));
    assert.ok(first.narrative.transitions.length > 0 && first.narrative.transitions.every((transition) => transition.text));
    assert.equal(first.storyAnalysis.centralStory.focusPosition, 'present');
    assert.equal(first.storyAnalysis.relationships.length <= 2, true);
    assert.equal(new Set(first.storyAnalysis.openingThemes).size, first.storyAnalysis.openingThemes.length);
  }
});
