import { loadTarotData } from './data/loader.js';
import { createReading } from './tarot/reading-engine.js';
import { debugReading } from './tarot/debug.js';

const data = await loadTarotData();
const reading = createReading({ context: process.argv[2] ?? 'love', seed: process.argv[3] ?? 12345, data });
debugReading(reading);
