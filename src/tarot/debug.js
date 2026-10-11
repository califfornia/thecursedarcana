export function debugReading(reading, logger = console.log) {
  const line = '═'.repeat(36);
  logger(`${line}\n        THE CURSED ARCANA\n${line}\n\nContext: ${reading.context.toUpperCase()}\n\nCurse Count: ${reading.curseCount}\nCurse Level: ${reading.curseLevel}\n`);
  for (const card of reading.cards) logger(`${card.position.toUpperCase()}\n${card.cardName}\n${card.isCursed ? `CURSED — ${card.curse.name.toUpperCase()}` : 'Normal'}\n${card.meaning}\n${card.positionMeaning}\n`);
  const narrative = reading.narrative;
  const cardStories = narrative.cards.map((card) => [
    `${card.position.toUpperCase()} — ${card.cardName}`,
    card.summary,
    card.story,
    card.curseSummary,
  ].filter(Boolean).join('\n')).join('\n\n');
  logger(`────────────────────────────────────\nNARRATIVE\n────────────────────────────────────\n\n${narrative.opening}\n\n${cardStories}\n\nTHE THREAD\n${narrative.synthesis}\n\n${narrative.closing}\n${line}`);
}
