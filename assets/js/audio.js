/**
 * Audio module — real sound effects via Freesound API (free, no API key needed
 * for preview MP3 downloads). Falls back to Web Audio synthesis if offline.
 */

let ctx = null;
let enabled = true;
const cache = new Map();

const SOUNDS = {
  correct: 'https://cdn.freesound.org/previews/464/464806_8986374-lq.mp3',
  wrong: 'https://cdn.freesound.org/previews/388/388426_7385370-lq.mp3',
  click: 'https://cdn.freesound.org/previews/560/560434_16029129-lq.mp3',
  joker: 'https://cdn.freesound.org/previews/270/270327_5123851-lq.mp3',
  tick: 'https://cdn.freesound.org/previews/316/316847_4919311-lq.mp3',
  win: 'https://cdn.freesound.org/previews/483/483548_8627046-lq.mp3',
  lose: 'https://cdn.freesound.org/previews/387/387435_7385370-lq.mp3',
  start: 'https://cdn.freesound.org/previews/270/270327_5123851-lq.mp3',
  final: 'https://cdn.freesound.org/previews/464/464806_8986374-lq.mp3',
};

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

async function playSound(name) {
  if (!enabled) return;
  const url = SOUNDS[name];
  if (!url) return;

  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    cache.set(name, audio);
  }

  try {
    audio.currentTime = 0;
    audio.volume = name === 'tick' ? 0.4 : 0.7;
    await audio.play();
  } catch (e) {
    // Fallback to synthesized sound
    synthFallback(name);
  }
}

function synthFallback(name) {
  const ac = getCtx();
  if (!ac || !enabled) return;
  const tone = (freq, dur, type = 'sine', vol = 0.3, delay = 0) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ac.destination);
    const t = ac.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  };
  switch (name) {
    case 'correct': tone(523, 0.15, 'triangle', 0.25); tone(659, 0.15, 'triangle', 0.25, 0.1); tone(784, 0.3, 'triangle', 0.3, 0.2); break;
    case 'wrong': tone(220, 0.2, 'sawtooth', 0.2); tone(180, 0.4, 'sawtooth', 0.2, 0.15); break;
    case 'click': tone(800, 0.05, 'square', 0.1); break;
    case 'joker': tone(440, 0.1, 'triangle', 0.2); tone(660, 0.1, 'triangle', 0.2, 0.08); tone(880, 0.15, 'triangle', 0.25, 0.16); break;
    case 'tick': tone(1200, 0.04, 'square', 0.08); break;
    case 'win': [523, 659, 784, 1046, 1318].forEach((n, i) => tone(n, 0.3, 'triangle', 0.25, i * 0.12)); break;
    case 'lose': tone(300, 0.3, 'sawtooth', 0.2); tone(250, 0.4, 'sawtooth', 0.2, 0.2); tone(180, 0.6, 'sawtooth', 0.2, 0.4); break;
    case 'start': tone(440, 0.1, 'triangle', 0.2); tone(554, 0.1, 'triangle', 0.2, 0.1); tone(659, 0.2, 'triangle', 0.25, 0.2); break;
    case 'final': [659, 784, 988, 1318].forEach((n, i) => tone(n, 0.4, 'triangle', 0.3, i * 0.15)); break;
  }
}

export function setAudioEnabled(v) { enabled = v; }
export function isAudioEnabled() { return enabled; }
export function playCorrect() { playSound('correct'); }
export function playWrong() { playSound('wrong'); }
export function playClick() { playSound('click'); }
export function playJoker() { playSound('joker'); }
export function playTick() { playSound('tick'); }
export function playWin() { playSound('win'); }
export function playLose() { playSound('lose'); }
export function playStart() { playSound('start'); }
export function playFinal() { playSound('final'); }
export function resumeAudio() { getCtx(); }

// Preload all sounds on first user interaction
export function preloadSounds() {
  Object.values(SOUNDS).forEach(url => {
    const a = new Audio(url);
    a.preload = 'auto';
    a.load();
  });
}
