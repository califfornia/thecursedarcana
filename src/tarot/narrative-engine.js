const POSITION_PAIRS = [
  ['past', 'present'],
  ['present', 'future'],
  ['past', 'future'],
];
const PAIR_PRIORITY = new Map(['past|present', 'present|future', 'past|future'].map((pair, index) => [pair, index]));
const SIGNIFICANT_TYPES = new Set(['tension', 'distortion', 'confusion', 'contrast']);
const ROLE_BY_POSITION = Object.freeze({
  past: 'origin',
  present: 'central_focus',
  future: 'emerging_direction',
});

export function findThemeRelation(themeA, themeB, relations) {
  if (themeA === themeB) return undefined;
  return relations.find((relation) =>
    (relation.theme_a === themeA && relation.theme_b === themeB)
    || (relation.theme_a === themeB && relation.theme_b === themeA));
}

function normalizeWord(word) {
  let value = word.toLowerCase();
  if (value.endsWith('ies')) value = `${value.slice(0, -3)}y`;
  else {
    if (value.endsWith('s')) value = value.slice(0, -1);
    if (value.endsWith('ing')) value = value.slice(0, -3).replace(/(.)\1$/, '$1');
    else if (value.endsWith('ed')) value = value.slice(0, -2);
  }
  return value;
}

function hasThemeEvidence(theme, label, source) {
  const words = new Set(source.toLowerCase().match(/[a-z]+/g)?.map(normalizeWord) ?? []);
  const terms = `${theme.replaceAll('_', ' ')} ${label}`.toLowerCase().match(/[a-z]+/g) ?? [];
  return terms.some((term) => term.length >= 4 && words.has(normalizeWord(term)));
}

export function getDisplayThemes(card, themeLabels, preferredThemes = [], { contextMeaning = '', positionMeaning = '', keywords = [], excludedThemeIds = [] } = {}) {
  const preference = new Map(preferredThemes.map((theme, index) => [theme, preferredThemes.length - index]));
  return [...card.themes]
    .filter((theme) => !excludedThemeIds.includes(theme))
    .sort((a, b) => {
      const score = (theme) => (preference.get(theme) ?? 0) * 20
        + (hasThemeEvidence(theme, themeLabels[theme] ?? '', contextMeaning) ? 4 : 0)
        + (hasThemeEvidence(theme, themeLabels[theme] ?? '', positionMeaning) ? 3 : 0)
        + (hasThemeEvidence(theme, themeLabels[theme] ?? '', keywords.join(' ')) ? 1 : 0);
      return score(b) - score(a) || card.themes.indexOf(a) - card.themes.indexOf(b);
    })
    .slice(0, 2)
    .map((theme) => {
      const label = themeLabels[theme];
      if (!label) throw new Error(`Missing human-readable label for theme "${theme}"`);
      return label;
    });
}

function positionPairKey(positions) {
  return positions.includes('past') && positions.includes('present') ? 'past|present'
    : positions.includes('present') && positions.includes('future') ? 'present|future'
      : 'past|future';
}

function relationshipScore(positions, isCursed, repeatedThemes = false) {
  let score = positions.includes('present') ? 4 : 0;
  if (isCursed) score += 4;
  const pair = positionPairKey(positions);
  if (pair === 'past|present' || pair === 'present|future') score += 3;
  else score += 1;
  if (repeatedThemes) score += 2;
  return score;
}

function buildCurseDynamics(cards, data, context) {
  return cards.filter((card) => card.isCursed && card.curse).map((card) => {
    const curse = data.curses.find((item) => item.curse_id === card.curse.id);
    if (!curse) throw new Error(`Missing curse data for "${card.curse.id}"`);
    const distortionSource = curse.distortion.split('_becomes_')[0];
    const affected = new Set(card.themes.includes(distortionSource) ? [distortionSource] : []);
    if (affected.size) {
      for (const relation of data.theme_relations) {
        if (relation.theme_a === distortionSource && card.themes.includes(relation.theme_b)) affected.add(relation.theme_b);
        if (relation.theme_b === distortionSource && card.themes.includes(relation.theme_a)) affected.add(relation.theme_a);
      }
    } else {
      const curseRelation = data.theme_relations.find((relation) => relation.curse_aware && (
        relation.theme_a === curse.curse_id && card.themes.includes(relation.theme_b)
        || relation.theme_b === curse.curse_id && card.themes.includes(relation.theme_a)));
      if (curseRelation) affected.add(curseRelation.theme_a === curse.curse_id ? curseRelation.theme_b : curseRelation.theme_a);
      else affected.add(card.themes[0]);
    }
    const affectedThemes = [...affected];
    const primaryTheme = affectedThemes.find((theme) => theme !== distortionSource) ?? affectedThemes[0];
    const narrativeRole = card.position === 'past' ? 'carried_forward'
      : card.position === 'present' ? 'central_distortion' : 'possible_distortion';
    const templateId = `curse_role_${card.position}`;
    const roleTemplate = data.templates.find((item) => item.template_id === templateId);
    if (!roleTemplate) throw new Error(`Missing curse role template "${templateId}"`);
    return {
      cardId: card.cardId,
      curseId: curse.curse_id,
      position: card.position,
      affectedThemes,
      affectedThemeLabels: affectedThemes.map((theme) => data.theme_labels[theme]),
      distortionType: curse.distortion,
      narrativeRole,
      primaryTheme,
      curseContext: curse[`${context}_template`],
      text: interpolate(roleTemplate.template_text, {
        theme: data.theme_labels[primaryTheme],
        curse_name: curse.name,
        curse_context: curse[`${context}_template`],
      }),
    };
  });
}

function findCrossCardRelationships(cards, data) {
  const cardByPosition = new Map(cards.map((card) => [card.position, card]));
  const themePositions = new Map();
  for (const card of cards) for (const theme of card.themes) {
    const positions = themePositions.get(theme) ?? [];
    positions.push(card.position);
    themePositions.set(theme, positions);
  }
  const candidates = [];
  for (const [from, to] of POSITION_PAIRS) {
    const first = cardByPosition.get(from);
    const second = cardByPosition.get(to);
    if (!first || !second) continue;
    for (const themeA of first.themes) for (const themeB of second.themes) {
      const relation = findThemeRelation(themeA, themeB, data.theme_relations);
      if (!relation) continue;
      const positions = [from, to];
      const cursed = first.isCursed || second.isCursed;
      const repeated = (themePositions.get(themeA)?.length ?? 0) > 1 || (themePositions.get(themeB)?.length ?? 0) > 1;
      candidates.push({
        id: relation.id,
        type: relation.type,
        themes: [themeA, themeB],
        positions,
        scope: 'between-cards',
        text: relation.meaning,
        score: relationshipScore(positions, cursed, repeated),
        pairPriority: PAIR_PRIORITY.get(`${from}|${to}`),
      });
    }
  }
  return candidates;
}

function buildContinuities(cards, data) {
  const themePositions = new Map();
  for (const card of cards) for (const theme of card.themes) {
    const positions = themePositions.get(theme) ?? [];
    positions.push(card.position);
    themePositions.set(theme, positions);
  }
  const continuities = [...themePositions]
    .filter(([, positions]) => positions.length > 1)
    .map(([theme, positions]) => ({
      id: `repeat:${theme}`,
      type: 'repetition',
      themes: [theme],
      positions,
      score: relationshipScore(positions, cards.some((card) => positions.includes(card.position) && card.isCursed), true),
    }));

  for (const [from, to] of POSITION_PAIRS) {
    const first = cards.find((card) => card.position === from);
    const second = cards.find((card) => card.position === to);
    for (const a of first?.themes ?? []) for (const b of second?.themes ?? []) {
      if (a === b || continuities.some((item) => item.themes.includes(a) && item.themes.includes(b))) continue;
      const relation = findThemeRelation(a, b, data.theme_relations);
      if (!relation || !['harmony', 'reinforcement'].includes(relation.type)) continue;
      continuities.push({
        id: relation.id,
        type: relation.type,
        themes: [a, b],
        positions: [from, to],
        score: relationshipScore([from, to], Boolean(first?.isCursed || second?.isCursed), false),
      });
    }
  }
  return continuities.sort((a, b) => b.score - a.score || a.positions.length - b.positions.length);
}

function chooseRelationships(candidates, curseDynamics) {
  const curseCandidates = curseDynamics.map((dynamic) => ({
    id: `curse:${dynamic.cardId}:${dynamic.curseId}`,
    type: 'distortion',
    themes: [dynamic.primaryTheme, dynamic.curseId],
    positions: [dynamic.position],
    scope: 'curse-theme',
    text: dynamic.text,
    score: relationshipScore([dynamic.position], true) + (dynamic.position === 'present' ? 6 : 0),
    pairPriority: -1,
  }));
  const all = [...candidates, ...curseCandidates];
  all.sort((a, b) => b.score - a.score || a.pairPriority - b.pairPriority || a.id.localeCompare(b.id));
  const chosen = [];
  const usedPairs = new Set();
  for (const item of all) {
    const key = `${item.scope}|${[...item.themes].sort().join('|')}|${[...item.positions].sort().join('|')}`;
    if (usedPairs.has(key)) continue;
    chosen.push(item);
    usedPairs.add(key);
    if (chosen.length === 2) break;
  }
  return chosen;
}

function calculateDominantTheme(cards, themeLabels) {
  const scores = new Map();
  for (const card of cards) {
    const positionWeight = card.position === 'present' ? 3 : 1;
    for (const theme of card.themes) scores.set(theme, (scores.get(theme) ?? 0) + positionWeight + (card.isCursed ? 2 : 0));
  }
  const id = [...scores].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!id) throw new Error('Cannot calculate a dominant theme for an empty reading');
  return { id, label: themeLabels[id], score: scores.get(id) };
}

function stableIndex(seed, length) {
  const text = String(seed ?? '0');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) % length;
}

function findTemplate(data, id) {
  const item = data.templates.find((template) => template.template_id === id);
  if (!item) throw new Error(`Missing narrative template "${id}"`);
  return item.template_text;
}

function interpolate(text, values) {
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    if (values[key] === undefined || values[key] === null) throw new Error(`Missing narrative value "${key}"`);
    return values[key];
  });
}

function preferredThemesFor(card, relationships, cards) {
  const counts = new Map();
  for (const item of cards) for (const theme of item.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  return card.themes.map((theme, index) => ({
    theme,
    index,
    score: relationships.filter((relation) => relation.positions.includes(card.position) && relation.themes.includes(theme)).length * 10
      + ((counts.get(theme) ?? 0) - 1) * 2,
  })).sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.theme);
}

function themeFor(card, data, preferred = [], excluded = []) {
  const excludedThemeIds = Object.entries(data.theme_labels).filter(([, label]) => excluded.includes(label)).map(([id]) => id);
  const display = getDisplayThemes(card, data.theme_labels, preferred, {
    contextMeaning: card.meaning,
    positionMeaning: card.positionMeaning,
    keywords: data.cards.find((item) => item.id === card.cardId)?.keywords.split('|') ?? [],
    excludedThemeIds,
  });
  const available = display.find((label) => !excluded.includes(label));
  if (available) return available;
  const fallback = display[0];
  if (!fallback) throw new Error(`No display theme available for ${card.cardName}`);
  return fallback;
}

function buildStoryAnalysisCore(cards, context, data) {
  const themeMap = Object.fromEntries(cards.map((card) => [card.position, [...card.themes]]));
  const curseDynamics = buildCurseDynamics(cards, data, context);
  const continuities = buildContinuities(cards, data);
  const candidates = findCrossCardRelationships(cards, data);
  const relationships = chooseRelationships(candidates, curseDynamics);
  const dominantTheme = calculateDominantTheme(cards, data.theme_labels);
  const byPosition = new Map(cards.map((card) => [card.position, card]));
  const arc = Object.fromEntries(cards.map((card) => {
    const preferred = preferredThemesFor(card, relationships, cards);
    const curse = curseDynamics.find((dynamic) => dynamic.cardId === card.cardId);
    const theme = curse?.primaryTheme ?? preferred[0];
    return [card.position, {
      cardId: card.cardId,
      cardName: card.cardName,
      role: ROLE_BY_POSITION[card.position],
      theme,
      themeLabel: data.theme_labels[theme],
      themes: [...card.themes],
    }];
  }));
  const continuity = continuities[0] ?? null;
  const centralCurse = curseDynamics.find((dynamic) => dynamic.position === 'present') ?? null;
  const centralRelationship = relationships.find((relation) => relation.positions.includes('present')) ?? null;
  const dominantRelationship = [...relationships].sort((a, b) => b.score - a.score || a.pairPriority - b.pairPriority)[0] ?? null;
  const progression = {
    pastToPresent: candidates.find((item) => item.positions[0] === 'past' && item.positions[1] === 'present') ?? null,
    presentToFuture: candidates.find((item) => item.positions[0] === 'present' && item.positions[1] === 'future') ?? null,
    pastToFuture: candidates.find((item) => item.positions[0] === 'past' && item.positions[1] === 'future') ?? null,
  };
  const tensions = relationships.filter((item) => item.type === 'tension');
  const centralStory = {
    focusPosition: 'present',
    focusCardId: byPosition.get('present')?.cardId,
    focusTheme: centralCurse?.primaryTheme ?? arc.present.theme,
    priority: centralCurse ? 'present_curse_theme' : centralRelationship ? 'present_relationship' : continuity ? 'continuity' : 'dominant_theme',
    curseDynamic: centralCurse?.curseId ?? null,
    relationship: centralRelationship?.id ?? null,
    continuity: continuity?.id ?? null,
  };
  return {
    arc,
    dominantTheme,
    dominantRelationship,
    curseDynamics,
    progression,
    tensions,
    continuities,
    relationships,
    centralStory,
    themeMap,
  };
}

function openingFor(cards, analysis, data) {
  const continuity = analysis.continuities.find((item) => item.positions.includes('present') && item.positions.includes('future'))
    ?? analysis.continuities[0];
  const past = cards.find((card) => card.position === 'past');
  const present = cards.find((card) => card.position === 'present');
  const future = cards.find((card) => card.position === 'future');
  const continuityLabels = continuity?.themes.map((id) => data.theme_labels[id]) ?? [];
  let presentTheme = analysis.arc.present.themeLabel ?? themeFor(present, data, preferredThemesFor(present, analysis.relationships, cards));
  if (continuityLabels.includes(presentTheme)) {
    presentTheme = themeFor(present, data, preferredThemesFor(present, analysis.relationships, cards), continuityLabels);
  }
  if (continuity) {
    const repeatedThemeId = continuity.themes.find((theme) => future.themes.includes(theme)) ?? continuity.themes[0];
    const repeatedLabel = data.theme_labels[repeatedThemeId];
    const occursPast = continuity.positions.includes('past');
    // The present card anchors the story. Choose the other labels around it so
    // continuity and the central theme are not accidentally repeated verbatim.
    if (presentTheme === repeatedLabel) {
      presentTheme = themeFor(present, data, preferredThemesFor(present, analysis.relationships, cards), [repeatedLabel]);
    }
    const pastTheme = themeFor(past, data, preferredThemesFor(past, analysis.relationships, cards), [repeatedLabel, presentTheme]);
    const futureTheme = themeFor(future, data, preferredThemesFor(future, analysis.relationships, cards), [repeatedLabel, presentTheme, pastTheme]);
    const selectedThemes = occursPast ? [repeatedLabel, presentTheme] : [pastTheme, presentTheme, repeatedLabel, futureTheme];
    return {
      text: interpolate(findTemplate(data, occursPast ? 'story_opening_continuity_span' : 'story_opening_continuity'), {
      continuity_theme: repeatedLabel,
      past_theme: pastTheme,
      present_theme: presentTheme,
      future_theme: futureTheme,
      }),
      themes: selectedThemes,
    };
  }
  const pastTheme = themeFor(past, data, preferredThemesFor(past, analysis.relationships, cards), [presentTheme]);
  const used = [pastTheme, presentTheme];
  const futureTheme = themeFor(future, data, preferredThemesFor(future, analysis.relationships, cards), used);
  return {
    text: interpolate(findTemplate(data, 'story_opening_standard'), {
      past_theme: pastTheme,
      present_theme: presentTheme,
      future_theme: futureTheme,
    }),
    themes: [pastTheme, presentTheme, futureTheme],
  };
}

function transitionFor(from, to, cards, analysis, data) {
  const exactContinuity = analysis.continuities.find((item) => item.positions.includes(from.position) && item.positions.includes(to.position) && item.themes.some((theme) => from.themes.includes(theme) && to.themes.includes(theme)));
  const fromTheme = themeFor(from, data, preferredThemesFor(from, analysis.relationships, cards));
  const toTheme = themeFor(to, data, preferredThemesFor(to, analysis.relationships, cards), [fromTheme]);
  if (exactContinuity) {
    const theme = exactContinuity.themes.find((id) => from.themes.includes(id) && to.themes.includes(id));
    const themeLabel = data.theme_labels[theme];
    const futureTheme = themeFor(to, data, preferredThemesFor(to, analysis.relationships, cards), [themeLabel]);
    return interpolate(findTemplate(data, 'transition_continuity'), {
      continuity_theme: themeLabel,
      from_position: from.position,
      to_position: to.position,
      future_theme: futureTheme,
    });
  }
  const relation = analysis.progression[`${from.position}To${to.position[0].toUpperCase()}${to.position.slice(1)}`];
  if (relation?.type === 'tension') {
    return interpolate(findTemplate(data, 'transition_tension'), {
      theme_a: data.theme_labels[relation.themes[0]],
      theme_b: data.theme_labels[relation.themes[1]],
    });
  }
  if (relation?.type === 'progression') {
    return interpolate(findTemplate(data, 'transition_progression'), {
      theme_a: data.theme_labels[relation.themes[0]],
      theme_b: data.theme_labels[relation.themes[1]],
    });
  }
  const id = from.position === 'past' && to.position === 'present' ? 'transition_past_to_present'
    : from.position === 'present' && to.position === 'future' ? 'transition_present_to_future'
      : 'transition_past_to_future';
  const values = {
    past_theme: from.position === 'past' ? fromTheme : toTheme,
    present_theme: from.position === 'present' ? fromTheme : to.position === 'present' ? toTheme : analysis.arc.present.themeLabel,
    future_theme: to.position === 'future' ? toTheme : from.position === 'future' ? fromTheme : analysis.arc.future.themeLabel,
  };
  return interpolate(findTemplate(data, id), values);
}

function centralSynthesis(analysis, cards, data) {
  const present = cards.find((card) => card.position === 'present');
  const future = cards.find((card) => card.position === 'future');
  const presentDynamic = analysis.curseDynamics.find((dynamic) => dynamic.position === 'present');
  const continuity = analysis.continuities.find((item) => item.positions.includes('present') && item.positions.includes('future'));
  const presentTheme = analysis.arc.present.themeLabel;
  if (presentDynamic && continuity) {
    const repeatedTheme = continuity.themes.find((id) => future.themes.includes(id)) ?? continuity.themes[0];
    const repeatedLabel = data.theme_labels[repeatedTheme];
    const futureTheme = themeFor(future, data, preferredThemesFor(future, analysis.relationships, cards), [repeatedLabel]);
    const presentTheme = data.theme_labels[presentDynamic.primaryTheme] === repeatedLabel
      ? themeFor(present, data, preferredThemesFor(present, analysis.relationships, cards), [repeatedLabel])
      : data.theme_labels[presentDynamic.primaryTheme];
    return interpolate(findTemplate(data, 'thread_curse_continuity'), {
      present_theme: presentTheme ?? analysis.arc.present.themeLabel,
      curse_name: data.curses.find((item) => item.curse_id === presentDynamic.curseId).name,
      continuity_theme: repeatedLabel,
      future_theme: futureTheme,
    });
  }
  if (presentDynamic) {
    return interpolate(findTemplate(data, 'thread_curse'), {
      present_theme: data.theme_labels[presentDynamic.primaryTheme] ?? presentTheme,
      curse_name: data.curses.find((item) => item.curse_id === presentDynamic.curseId).name,
    });
  }
  if (analysis.centralStory.relationship) {
    const relation = analysis.relationships.find((item) => item.id === analysis.centralStory.relationship);
    return interpolate(findTemplate(data, 'thread_relationship'), { relationship_text: relation.text });
  }
  if (continuity) {
    const id = continuity.themes.find((theme) => present.themes.includes(theme)) ?? continuity.themes[0];
    const label = data.theme_labels[id];
    const futureTheme = themeFor(future, data, preferredThemesFor(future, analysis.relationships, cards), [label]);
    return interpolate(findTemplate(data, 'thread_continuity'), {
      continuity_theme: label,
      present_theme: analysis.arc.present.themeLabel,
      future_theme: futureTheme,
    });
  }
  return interpolate(findTemplate(data, 'thread_dominant'), { dominant_theme: analysis.dominantTheme.label });
}

export function buildStoryAnalysis(cards, context, data) {
  return buildStoryAnalysisCore(cards, context, data);
}

export function generateNarrative(cards, context, data, { seed } = {}) {
  const storyAnalysis = buildStoryAnalysis(cards, context, data);
  const narrativeCards = cards.map((card) => {
    const curseDynamic = storyAnalysis.curseDynamics.find((dynamic) => dynamic.cardId === card.cardId);
    const curse = card.isCursed ? data.curses.find((item) => item.curse_id === card.curse.id) : null;
    const preferred = preferredThemesFor(card, storyAnalysis.relationships, cards);
    return {
      position: card.position,
      cardId: card.cardId,
      cardName: card.cardName,
      role: ROLE_BY_POSITION[card.position],
      themes: getDisplayThemes(card, data.theme_labels, preferred, {
        contextMeaning: card.meaning,
        positionMeaning: card.positionMeaning,
        keywords: data.cards.find((item) => item.id === card.cardId)?.keywords.split('|') ?? [],
      }),
      summary: card.meaning,
      story: card.positionMeaning,
      curseSummary: curseDynamic?.text ?? (curse ? curse[`${context}_template`] : null),
    };
  });
  const narrativeCardInput = cards.map((card) => ({ ...card, cardName: card.cardName }));
  const openingResult = openingFor(narrativeCardInput, storyAnalysis, data);
  const opening = openingResult.text;
  storyAnalysis.openingThemes = openingResult.themes;
  const transitions = [
    { from: 'past', to: 'present', text: transitionFor(cards.find((card) => card.position === 'past'), cards.find((card) => card.position === 'present'), cards, storyAnalysis, data) },
    { from: 'present', to: 'future', text: transitionFor(cards.find((card) => card.position === 'present'), cards.find((card) => card.position === 'future'), cards, storyAnalysis, data) },
  ];
  const synthesis = centralSynthesis(storyAnalysis, cards, data);
  const hasCurse = cards.some((card) => card.isCursed);
  let closing;
  if (hasCurse) {
    const variants = data.templates.filter((item) => item.section === 'closing' && item.curse_state === 'cursed' && item.template_id !== 'close_02').sort((a, b) => a.template_id.localeCompare(b.template_id));
    if (!variants.length) throw new Error('Missing curse-aware closing templates');
    closing = variants[stableIndex(seed, variants.length)].template_text;
  } else {
    closing = data.templates.find((item) => item.template_id === 'close_01')?.template_text;
  }
  if (!closing) throw new Error('Missing closing template');
  const displayRelationships = storyAnalysis.relationships.map((relation) => ({
    ...relation,
    themes: relation.themes.map((id) => ({ id, label: data.theme_labels[id] ?? data.curses.find((curse) => curse.curse_id === id)?.name ?? id })),
  }));
  storyAnalysis.relationships = displayRelationships;
  storyAnalysis.dominantRelationship = displayRelationships.find((relation) => relation.id === storyAnalysis.dominantRelationship?.id) ?? null;
  storyAnalysis.tensions = displayRelationships.filter((relation) => relation.type === 'tension');
  return {
    opening,
    cards: narrativeCards,
    transitions,
    relationships: displayRelationships,
    synthesis,
    closing,
    storyAnalysis,
    themeMap: storyAnalysis.themeMap,
    dominantTheme: storyAnalysis.dominantTheme,
  };
}
