export function createRandom(seed) {
  if (seed === undefined || seed === null) return Math.random;
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function choose(items, random) {
  if (!items.length) throw new Error('Cannot choose from an empty list');
  return items[Math.floor(random() * items.length)];
}
