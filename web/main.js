import { createReading } from '../src/tarot/reading-engine.js';
import { createRiveController } from './rive-controller.js';

const contextButtons = [...document.querySelectorAll('[data-context]')];
const introModal = document.querySelector('#intro-modal');
const themeModal = document.querySelector('#theme-modal');
const readingModal = document.querySelector('#reading-modal');
const startReadingButton = document.querySelector('#start-reading');
const narrativeContainer = document.querySelector('#narrative');
const themeError = document.querySelector('#theme-error');
const sceneCanvas = document.querySelector('#reading-canvas');
const scenePrompt = document.querySelector('#scene-prompt');
const appShell = document.querySelector('.app-shell');
const audioControls = document.querySelector('.audio-controls');
const glitchAudio = new Audio('/web/assets/cursed-glitch.mp3');
const normalCardAudio = new Audio('/web/assets/normal-card-magic.mp3');
const backgroundMusic = new Audio('/web/assets/arcana-background-music.mp3');
const musicToggle = document.querySelector('#music-toggle');
const musicVolume = document.querySelector('#music-volume');
const musicVolumeValue = document.querySelector('#music-volume-value');
const musicStatus = document.querySelector('#music-status');
const musicOnIcon = document.querySelector('#music-on-icon');
const musicOffIcon = document.querySelector('#music-off-icon');
glitchAudio.preload = 'auto';
normalCardAudio.preload = 'auto';
backgroundMusic.loop = true;
backgroundMusic.preload = 'auto';
backgroundMusic.volume = Number(musicVolume.value) / 100;
let musicMuted = false;
let lastMusicVolume = backgroundMusic.volume;
let musicStarted = false;
let musicStartPending = false;

function syncMusicControls() {
  musicToggle.setAttribute('aria-pressed', String(musicMuted));
  musicToggle.setAttribute('aria-label', musicMuted ? 'Unmute background music' : 'Mute background music');
  musicOnIcon.hidden = musicMuted;
  musicOffIcon.hidden = !musicMuted;
  musicVolumeValue.value = `${Math.round(backgroundMusic.volume * 100)}%`;
}

syncMusicControls();

function startBackgroundMusic() {
  if (musicStarted || musicStartPending) return;
  musicStartPending = true;
  void backgroundMusic.play().then(() => {
    musicStarted = true;
    musicStartPending = false;
    musicStatus.textContent = 'Background music is playing.';
  }).catch((error) => {
    musicStartPending = false;
    musicStatus.textContent = 'Background music could not start. Check your browser audio settings.';
    console.error('Failed to start background music:', error);
  });
}

function playSound(audio, label) {
  const playback = audio.cloneNode();
  void playback.play().catch((error) => {
    console.error(`Failed to play ${label} audio:`, error);
  });
}

let readingActive = false;
const riveController = createRiveController({
  canvas: sceneCanvas,
  onRequestReading: handleStartReading,
  onCursedReveal: () => playSound(glitchAudio, 'cursed-card glitch'),
  onNormalReveal: () => playSound(normalCardAudio, 'normal-card magic'),
  onComplete: () => {
    readingActive = false;
    narrativeContainer.hidden = false;
    setStatus('rive', '✓ Reveal complete');
    openDialog(readingModal);
    syncScenePrompt();
  },
});
let selectedContext = 'unknown';
let tarotData = null;

function openDialog(dialog) {
  const currentDialog = [introModal, themeModal, readingModal].find((item) => item.open);
  if (currentDialog && currentDialog !== dialog) currentDialog.close();
  if (!dialog.open) dialog.showModal();
  dialog.append(audioControls);
  syncScenePrompt();
}

function closeDialogs() {
  for (const dialog of [introModal, themeModal, readingModal]) {
    if (dialog.open) dialog.close();
  }
  syncScenePrompt();
}

function syncScenePrompt() {
  scenePrompt.hidden = [introModal, themeModal, readingModal].some((dialog) => dialog.open)
    || readingActive
    || !tarotData;
  sceneCanvas.style.pointerEvents = readingActive ? 'none' : 'auto';
}

function setStatus(key, value) {
  const element = document.querySelector(`[data-status="${key}"]`);
  if (element) element.textContent = value;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector('#error').textContent = message;
  themeError.textContent = message;
  setStatus('error', `✕ ${message}`);
  console.error(error);
}

async function loadData() {
  const names = ['cards', 'contexts', 'positions', 'curses', 'templates', 'lists', 'theme_relations', 'theme_labels'];
  const entries = await Promise.all(names.map(async (name) => {
    let response;
    try {
      response = await fetch(`/data/${name}.json`);
    } catch (error) {
      throw new Error(`Failed to load ${name}.json: ${error.message}`);
    }
    if (!response.ok) throw new Error(`Failed to load ${name}.json (HTTP ${response.status})`);
    try {
      return [name, await response.json()];
    } catch (error) {
      throw new Error(`Invalid ${name}.json: ${error.message}`);
    }
  }));
  return Object.fromEntries(entries);
}

function renderReading(reading) {
  narrativeContainer.replaceChildren();
  const addParagraph = (text, className = '') => {
    if (!text) return;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    if (className) paragraph.className = className;
    narrativeContainer.append(paragraph);
  };
  addParagraph(reading.narrative.opening, 'opening');
  for (const interpretation of reading.narrative.cards) {
    const section = document.createElement('section');
    section.className = `card-story ${interpretation.position}`;
    const subheading = document.createElement('h3');
    subheading.textContent = `${interpretation.position.toUpperCase()} — ${interpretation.cardName}`;
    section.append(subheading);
    for (const [text, className] of [
      [interpretation.story, 'position-story'],
      [interpretation.curseSummary, 'curse-meaning'],
    ]) {
      if (!text) continue;
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      paragraph.className = className;
      section.append(paragraph);
    }
    narrativeContainer.append(section);
    const transition = reading.narrative.transitions.find((item) => item.from === interpretation.position);
    if (transition) {
      const bridge = document.createElement('p');
      bridge.className = 'story-transition';
      bridge.textContent = transition.text;
      narrativeContainer.append(bridge);
    }
  }
  const threadHeading = document.createElement('h3');
  threadHeading.textContent = 'THE THREAD';
  narrativeContainer.append(threadHeading);
  addParagraph(reading.narrative.synthesis, 'synthesis');
  addParagraph(reading.narrative.closing, 'closing');

  setStatus('context', reading.context.toUpperCase());
  setStatus('cards', String(reading.cards.length));
  setStatus('cursed', String(reading.curseCount));
  setStatus('level', String(reading.curseLevel));
  setStatus('error', '');
  document.querySelector('#error').textContent = '';
  themeError.textContent = '';
}

musicToggle.addEventListener('click', () => {
  musicMuted = !musicMuted;
  if (musicMuted) {
    if (backgroundMusic.volume > 0) lastMusicVolume = backgroundMusic.volume;
    backgroundMusic.muted = true;
  } else {
    backgroundMusic.volume = lastMusicVolume;
    backgroundMusic.muted = false;
    startBackgroundMusic();
  }
  syncMusicControls();
});

musicVolume.addEventListener('input', () => {
  const volume = Number(musicVolume.value) / 100;
  backgroundMusic.volume = volume;
  musicMuted = volume === 0;
  backgroundMusic.muted = musicMuted;
  if (volume > 0) {
    lastMusicVolume = volume;
    startBackgroundMusic();
  }
  syncMusicControls();
});

async function showReadingResult(reading) {
  renderReading(reading);
  narrativeContainer.hidden = true;
  closeDialogs();
  try {
    const started = await riveController.playReading(reading);
    if (started) setStatus('rive', '✓ Playing');
    return started;
  } catch (error) {
    readingActive = false;
    narrativeContainer.hidden = false;
    setStatus('rive', `✕ ${error.message}`);
    showError(error);
    openDialog(readingModal);
    return false;
  }
}

function handleStartReading() {
  if (readingActive) return;
  readingActive = true;
  syncScenePrompt();
  try {
    if (!tarotData) throw new Error('Tarot data has not loaded. Check ENGINE STATUS for details.');
    const reading = createReading({ context: selectedContext, data: tarotData });
    void showReadingResult(reading).then((started) => {
      if (!started) {
        readingActive = false;
        syncScenePrompt();
      }
    });
  } catch (error) {
    readingActive = false;
    syncScenePrompt();
    showError(error);
  }
}

contextButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedContext = button.dataset.context;
    contextButtons.forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-pressed', String(isSelected));
    });
    setStatus('context', selectedContext.toUpperCase());
    themeError.textContent = '';
  });
});

document.querySelector('#begin-reading').addEventListener('click', () => {
  startBackgroundMusic();
  openDialog(themeModal);
});
document.querySelector('#back-to-intro').addEventListener('click', () => openDialog(introModal));
document.querySelector('#new-reading').addEventListener('click', () => {
  readingActive = false;
  riveController.reset();
  openDialog(themeModal);
});
document.querySelector('#close-reading').addEventListener('click', () => readingModal.close());
startReadingButton.addEventListener('click', handleStartReading);

readingModal.addEventListener('click', (event) => {
  if (event.target === readingModal) readingModal.close();
});

readingModal.addEventListener('cancel', () => readingModal.close());
for (const dialog of [introModal, themeModal, readingModal]) {
  dialog.addEventListener('close', () => {
    if (![introModal, themeModal, readingModal].some((item) => item.open)) {
      appShell.append(audioControls);
    }
    syncScenePrompt();
  });
}

themeModal.addEventListener('cancel', (event) => {
  event.preventDefault();
  openDialog(introModal);
});

setStatus('server', '✓ Connected');
setStatus('rive', globalThis.rive ? '✓ Runtime ready' : '✕ Runtime failed to load');
setStatus('context', selectedContext.toUpperCase());
openDialog(introModal);
void riveController.initialize().then(() => {
  setStatus('rive', '✓ Scene ready');
}).catch((error) => {
  setStatus('rive', `✕ ${error.message}`);
  showError(error);
});
try {
  tarotData = await loadData();
  setStatus('data', '✓ Loaded');
  setStatus('engine', '✓ Initialized');
  startReadingButton.disabled = false;
  syncScenePrompt();
} catch (error) {
  console.error('Tarot Engine startup failed:', error);
  setStatus('data', `✕ ${error.message}`);
  showError(error);
}
