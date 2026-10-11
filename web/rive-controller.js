const CARD_POSITIONS = ['past', 'present', 'future'];
const CARD_FACE_PATTERN = /^major_(\d{2})$/;
const RIVE_FILE_URL = '/web/assets/myproject.riv';
const CARD_IMAGE_URL = (number) => `/myproject/${number}.png`;
const STATE_MACHINE = 'ReadingExperience';

export function mapReadingToRive(reading) {
  if (!Array.isArray(reading?.cards) || reading.cards.length !== CARD_POSITIONS.length) {
    throw new Error('Rive needs exactly three tarot cards.');
  }

  const cardsByPosition = new Map();
  for (const card of reading.cards) {
    if (!CARD_POSITIONS.includes(card.position) || cardsByPosition.has(card.position)) {
      throw new Error(`Rive cannot map the card position "${card.position}".`);
    }
    const match = CARD_FACE_PATTERN.exec(card.cardId);
    const faceNumber = Number(match?.[1]);
    if (!match || faceNumber > 21) {
      throw new Error(`Rive cannot map the card face "${card.cardId}".`);
    }
    cardsByPosition.set(card.position, { faceNumber, isCursed: Boolean(card.isCursed) });
  }

  return CARD_POSITIONS.map((position) => {
    const card = cardsByPosition.get(position);
    if (!card) throw new Error(`Rive is missing the "${position}" card.`);
    return {
      position,
      imageUrl: CARD_IMAGE_URL(card.faceNumber),
      isCursed: card.isCursed,
    };
  });
}

export function createRiveController({
  canvas,
  onComplete = () => {},
  onCursedReveal = () => {},
  onNormalReveal = () => {},
  onRequestReading = () => {},
  runtime = globalThis.rive,
  fetchImage = fetch,
}) {
  let instance = null;
  let eventHandler = null;
  let images = [];
  let generation = 0;
  let activeGeneration = null;
  let initialization = null;

  function handleRiveEvent(event) {
    if (event.data?.name === 'ReadingRequested') {
      queueMicrotask(onRequestReading);
      return;
    }
    if (event.data?.name === 'CursedCardReveal' && activeGeneration === generation) {
      onCursedReveal();
      return;
    }
    if (event.data?.name === 'NormalCardReveal' && activeGeneration === generation) {
      onNormalReveal();
      return;
    }
    if (event.data?.name === 'ReadingComplete' && activeGeneration === generation) {
      activeGeneration = null;
      onComplete();
    }
  }

  function releaseImages() {
    for (const image of images) image.unref();
    images = [];
  }

  function reset() {
    generation += 1;
    activeGeneration = null;
    try {
      instance?.reset({
        artboard: 'Escene',
        stateMachine: STATE_MACHINE,
        autoplay: true,
        autoBind: true,
      });
    } finally {
      releaseImages();
    }
  }

  async function initialize() {
    if (instance) return true;
    if (!runtime?.Rive || !runtime.EventType?.RiveEvent) {
      throw new Error('The Rive web runtime is unavailable. Check that its script loaded correctly.');
    }
    if (initialization) return initialization;

    initialization = new Promise((resolve, reject) => {
      let nextInstance;
      nextInstance = new runtime.Rive({
        src: RIVE_FILE_URL,
        canvas,
        enableGPUCanvas: true,
        artboard: 'Escene',
        stateMachine: STATE_MACHINE,
        autoplay: true,
        autoBind: true,
        layout: new runtime.Layout({ fit: runtime.Fit.Cover, alignment: runtime.Alignment.Center }),
        onLoad: () => {
          nextInstance.resizeDrawingSurfaceToCanvas();
          instance = nextInstance;
          eventHandler = handleRiveEvent;
          instance.on(runtime.EventType.RiveEvent, eventHandler);
          resolve(true);
        },
        onLoadError: (event) => {
          const details = event?.data ? `: ${event.data}` : '';
          nextInstance?.cleanup();
          reject(new Error(`Failed to load the Rive reading scene${details}.`));
        },
      });
    });

    try {
      return await initialization;
    } finally {
      initialization = null;
    }
  }

  async function loadImage(url) {
    const response = await fetchImage(url);
    if (!response.ok) throw new Error(`Failed to load tarot card image ${url} (HTTP ${response.status}).`);
    return runtime.decodeImage(new Uint8Array(await response.arrayBuffer()));
  }

  async function playReading(reading) {
    reset();
    const currentGeneration = generation;
    const cards = mapReadingToRive(reading);
    if (!runtime.decodeImage) throw new Error('The Rive image decoder is unavailable.');

    try {
      await initialize();
      if (currentGeneration !== generation) return false;

      const viewModel = instance.viewModelInstance;
      if (!viewModel) throw new Error('The Rive Reading View Model did not bind to the scene.');

      const imageResults = await Promise.allSettled(cards.map((card) => loadImage(card.imageUrl)));
      const failedImage = imageResults.find((result) => result.status === 'rejected');
      if (failedImage?.status === 'rejected') {
        for (const result of imageResults) {
          if (result.status === 'fulfilled') result.value.unref();
        }
        throw failedImage.reason;
      }
      const loadedImages = imageResults.map((result) => result.value);
      if (currentGeneration !== generation) {
        for (const image of loadedImages) image.unref();
        return false;
      }
      images = loadedImages;

      cards.forEach((card, index) => {
        const imageProperty = viewModel.image(`${card.position}Face`);
        const cursedProperty = viewModel.boolean(`${card.position}Cursed`);
        if (!imageProperty || !cursedProperty) {
          throw new Error(`The Rive View Model is missing properties for "${card.position}".`);
        }
        imageProperty.value = images[index];
        cursedProperty.value = card.isCursed;
      });

      instance.resizeDrawingSurfaceToCanvas();
      activeGeneration = currentGeneration;
      instance.play(STATE_MACHINE);
      const startTrigger = instance.stateMachineInputs(STATE_MACHINE)?.find((input) => input.name === 'startReveal');
      if (!startTrigger) throw new Error('The Rive state machine is missing its "startReveal" trigger.');
      startTrigger.fire();
      return true;
    } catch (error) {
      reset();
      throw error;
    }
  }

  return { initialize, playReading, reset };
}
