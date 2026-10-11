import test from 'node:test';
import assert from 'node:assert/strict';
import { createRiveController, mapReadingToRive } from '../web/rive-controller.js';

const reading = {
  cards: [
    { position: 'future', cardId: 'major_21', isCursed: true },
    { position: 'past', cardId: 'major_00', isCursed: false },
    { position: 'present', cardId: 'major_13', isCursed: true },
  ],
};

test('maps cards to Rive slots by position, independent of engine array order', () => {
  assert.deepEqual(mapReadingToRive(reading), [
    { position: 'past', imageUrl: '/web/assets/cards/0.png', isCursed: false },
    { position: 'present', imageUrl: '/web/assets/cards/13.png', isCursed: true },
    { position: 'future', imageUrl: '/web/assets/cards/21.png', isCursed: true },
  ]);
});

test('rejects a reading with a missing card', () => {
  assert.throws(() => mapReadingToRive({ cards: reading.cards.slice(1) }), /exactly three/);
});

test('rejects unsupported card ids and duplicate positions', () => {
  assert.throws(
    () => mapReadingToRive({ cards: reading.cards.map((card, index) => index ? card : { ...card, cardId: 'minor_00' }) }),
    /cannot map the card face/,
  );
  assert.throws(
    () => mapReadingToRive({ cards: reading.cards.map((card) => ({ ...card, position: 'past' })) }),
    /cannot map the card position/,
  );
});

test('binds faces and curse flags, starts the state machine, and handles completion', async () => {
  const boundImages = {};
  const boundBooleans = {};
  const listeners = new Map();
  const fetchedImages = [];
  const decodedImages = [];
  let triggerFired = false;
  let instanceCleaned = false;
  let completed = false;
  let requestReceived = false;
  let cursedRevealCount = 0;
  let normalRevealCount = 0;
  let instanceCount = 0;
  let riveOptions;
  const resetOptions = [];

  class FakeRive {
    constructor(options) {
      riveOptions = options;
      instanceCount += 1;
      this.viewModelInstance = {
        image: (name) => ({ set value(image) { boundImages[name] = image; } }),
        boolean: (name) => ({ set value(value) { boundBooleans[name] = value; } }),
      };
      queueMicrotask(options.onLoad);
    }

    resizeDrawingSurfaceToCanvas() {}
    play(name) { assert.equal(name, 'ReadingExperience'); }
    stateMachineInputs() { return [{ name: 'startReveal', fire: () => { triggerFired = true; } }]; }
    on(type, callback) { listeners.set(type, callback); }
    off(type) { listeners.delete(type); }
    reset(options) { resetOptions.push(options); }
    cleanup() { instanceCleaned = true; }
  }

  const runtime = {
    Rive: FakeRive,
    Layout: class {},
    Fit: { Cover: 'cover', Contain: 'contain' },
    Alignment: { Center: 'center' },
    EventType: { RiveEvent: 'riveevent' },
    decodeImage: async (bytes) => {
      const image = { nativeImage: bytes, unref() { image.released = true; } };
      decodedImages.push(image);
      return image;
    },
  };
  const controller = createRiveController({
    canvas: {},
    onComplete: () => { completed = true; },
    onCursedReveal: () => { cursedRevealCount += 1; },
    onNormalReveal: () => { normalRevealCount += 1; },
    onRequestReading: () => { requestReceived = true; },
    runtime,
    fetchImage: async (url) => {
      fetchedImages.push(url);
      return { ok: true, arrayBuffer: async () => new Uint8Array([url.length]).buffer };
    },
  });

  await controller.initialize();
  await controller.initialize();
  assert.equal(instanceCount, 1);
  assert.equal(riveOptions.enableGPUCanvas, true);
  listeners.get('riveevent')({ data: { name: 'ReadingRequested' } });
  await Promise.resolve();
  assert.equal(requestReceived, true);
  listeners.get('riveevent')({ data: { name: 'CursedCardReveal' } });
  assert.equal(cursedRevealCount, 0);
  listeners.get('riveevent')({ data: { name: 'NormalCardReveal' } });
  assert.equal(normalRevealCount, 0);

  await controller.playReading(reading);
  assert.deepEqual(fetchedImages, [
    '/web/assets/cards/0.png',
    '/web/assets/cards/13.png',
    '/web/assets/cards/21.png',
  ]);
  assert.equal(boundImages.pastFace, decodedImages[0]);
  assert.equal(boundImages.presentFace, decodedImages[1]);
  assert.equal(boundImages.futureFace, decodedImages[2]);
  assert.deepEqual(boundBooleans, { pastCursed: false, presentCursed: true, futureCursed: true });
  assert.equal(triggerFired, true);

  listeners.get('riveevent')({ data: { name: 'CursedCardReveal' } });
  assert.equal(cursedRevealCount, 1);
  listeners.get('riveevent')({ data: { name: 'NormalCardReveal' } });
  assert.equal(normalRevealCount, 1);
  listeners.get('riveevent')({ data: { name: 'ReadingComplete' } });
  assert.equal(completed, true);
  controller.reset();
  listeners.get('riveevent')({ data: { name: 'CursedCardReveal' } });
  assert.equal(cursedRevealCount, 1);
  listeners.get('riveevent')({ data: { name: 'NormalCardReveal' } });
  assert.equal(normalRevealCount, 1);
  assert.equal(instanceCleaned, false);
  assert.equal(listeners.has('riveevent'), true);
  assert.equal(resetOptions.length, 2);
  assert.deepEqual(resetOptions[0], {
    artboard: 'Escene',
    stateMachine: 'ReadingExperience',
    autoplay: true,
    autoBind: true,
  });
  assert.deepEqual(decodedImages.map((image) => image.released), [true, true, true]);
});
