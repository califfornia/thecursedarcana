import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { split } from './values.js';
export { split };

const DATA_DIR = fileURLToPath(new URL('../../', import.meta.url));
const files = ['cards', 'contexts', 'positions', 'curses', 'templates', 'lists'];
const THEME_TYPES = new Set(['harmony', 'tension', 'progression', 'distortion', 'confusion', 'contrast', 'reinforcement']);

async function readJson(file, directory, expectedType) {
  const text = await readFile(path.join(directory, file), 'utf8');
  try {
    const value = JSON.parse(text);
    const validType = expectedType === 'array' ? Array.isArray(value) : !Array.isArray(value) && value && typeof value === 'object';
    if (!validType) throw new Error(`expected a JSON ${expectedType}`);
    return value;
  } catch (error) {
    throw new Error(`Invalid ${file}: ${error.message}`);
  }
}

export async function loadTarotData(directory = DATA_DIR) {
  const entries = await Promise.all([
    ...files.map(async (name) => [name, await readJson(`${name}.json`, directory, 'array')]),
    ['theme_relations', await readJson('theme_relations.json', path.join(directory, 'data'), 'array')],
    ['theme_labels', await readJson('theme_labels.json', path.join(directory, 'data'), 'object')],
  ]);
  const data = Object.fromEntries(entries);
  validateTarotData(data);
  return data;
}

export function validateTarotData(data) {
  const required = ['cards', 'contexts', 'positions', 'curses', 'templates', 'theme_relations'];
  for (const key of required) if (!Array.isArray(data[key]) || !data[key].length) throw new Error(`Required dataset "${key}" is missing or empty`);
  if (!data.theme_labels || Array.isArray(data.theme_labels) || typeof data.theme_labels !== 'object' || !Object.keys(data.theme_labels).length) throw new Error('Required dataset "theme_labels" is missing or empty');
  const uniqueMap = (items, key, label) => {
    const map = new Map();
    for (const item of items) {
      if (!item?.[key]) throw new Error(`${label} entry is missing ${key}`);
      if (map.has(item[key])) throw new Error(`Duplicate ${label} ID "${item[key]}"`);
      map.set(item[key], item);
    }
    return map;
  };
  const cards = uniqueMap(data.cards, 'id', 'card');
  const curses = uniqueMap(data.curses, 'curse_id', 'curse');
  const themeIds = new Set(data.cards.flatMap((card) => split(card.themes)));
  for (const theme of themeIds) {
    if (typeof data.theme_labels[theme] !== 'string' || !data.theme_labels[theme].trim()) throw new Error(`Missing human-readable label for theme "${theme}"`);
  }
  for (const theme of Object.keys(data.theme_labels)) {
    if (!themeIds.has(theme)) throw new Error(`Theme label "${theme}" is not used by any card`);
  }
  const relationIds = new Set();
  const relationPairs = new Map();
  for (const relation of data.theme_relations) {
    for (const key of ['id', 'theme_a', 'theme_b', 'type', 'meaning']) {
      if (typeof relation?.[key] !== 'string' || !relation[key].trim()) throw new Error(`Theme relation is missing required field "${key}"`);
    }
    if (typeof relation.curse_aware !== 'boolean') throw new Error(`Theme relation "${relation.id}" must define boolean curse_aware`);
    if (relationIds.has(relation.id)) throw new Error(`Duplicate theme relation ID "${relation.id}"`);
    if (!THEME_TYPES.has(relation.type)) throw new Error(`Invalid relationship type "${relation.type}" in ${relation.id}`);
    for (const theme of [relation.theme_a, relation.theme_b]) if (!themeIds.has(theme)) throw new Error(`Theme relation "${relation.id}" references unknown theme "${theme}"`);
    const pair = [relation.theme_a, relation.theme_b].sort().join('|');
    const previousType = relationPairs.get(pair);
    if (previousType === relation.type) throw new Error(`Duplicate unordered theme pair "${pair}" with type "${relation.type}"`);
    relationPairs.set(pair, relation.type);
    relationIds.add(relation.id);
  }
  const contexts = new Set(['love', 'career', 'self', 'choice', 'unknown']);
  const positions = new Set(['past', 'present', 'future']);
  for (const row of data.contexts) {
    if (!cards.has(row.card_id)) throw new Error(`Context references missing card "${row.card_id}"`);
    if (!contexts.has(row.context)) throw new Error(`Invalid context "${row.context}"`);
    if (!row.meaning) throw new Error(`Missing context meaning for ${row.card_id}/${row.context}`);
  }
  for (const row of data.positions) {
    if (!cards.has(row.card_id)) throw new Error(`Position references missing card "${row.card_id}"`);
    if (!positions.has(row.position)) throw new Error(`Invalid position "${row.position}"`);
    if (!row.meaning) throw new Error(`Missing position meaning for ${row.card_id}/${row.position}`);
  }
  for (const card of data.cards) {
    for (const id of split(card.compatible_curses)) if (!curses.has(id)) throw new Error(`Card "${card.id}" references missing curse "${id}"`);
    for (const context of contexts) if (!data.contexts.some((row) => row.card_id === card.id && row.context === context)) throw new Error(`Missing context meaning for ${card.id}/${context}`);
    for (const position of positions) if (!data.positions.some((row) => row.card_id === card.id && row.position === position)) throw new Error(`Missing position meaning for ${card.id}/${position}`);
  }
  const requiredTemplateIds = [
    'story_opening_standard', 'story_opening_continuity', 'story_opening_continuity_span',
    'transition_past_to_present', 'transition_present_to_future', 'transition_past_to_future',
    'transition_continuity', 'transition_tension', 'transition_progression',
    'curse_role_past', 'curse_role_present', 'curse_role_future',
    'thread_curse_continuity', 'thread_curse', 'thread_relationship', 'thread_continuity', 'thread_dominant',
    'close_01', 'close_03', 'close_04', 'close_05',
  ];
  for (const id of requiredTemplateIds) if (!data.templates.some((row) => row.template_id === id && row.template_text)) throw new Error(`Required narrative template "${id}" is missing`);
  const requiredTemplates = ['opening', 'curse', 'closing', 'transition'];
  for (const section of requiredTemplates) if (!data.templates.some((row) => row.section === section && row.template_text)) throw new Error(`Required narrative template section "${section}" is missing`);
  for (const curse of data.curses) for (const context of contexts) if (!curse[`${context}_template`]) throw new Error(`Curse "${curse.curse_id}" is missing ${context}_template`);
  return true;
}
