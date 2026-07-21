/**
 * Main game controller — orchestrates screens, questions, jokers,
 * timer, scoring, and persistence.
 */

import { loadQuestions, pickQuestion, shuffleOptions } from './data.js';
import { Timer } from './timer.js';
import * as audio from './audio.js';
import * as storage from './storage.js';
import { burst, celebrate, clearConfetti } from './confetti.js';
import * as cloud from './supabase.js';

export const PRIZES = [
  1000, 2000, 5000, 10000, 20000,
  50000, 100000, 200000, 300000, 500000,
  750000, 1000000, 2000000, 5000000, 10000000,
];

export const BARAJ_INDEXES = [4, 9]; // 20.000 TL and 500.000 TL (0-indexed)
export const FINAL_INDEX = 14;

const TIER_NAMES = [
  'Kolay', 'Kolay', 'Kolay',
  'Orta', 'Orta', 'Orta',
  'Zor', 'Zor', 'Zor',
  'Çok Zor', 'Çok Zor',
  'Uzman', 'Uzman',
  'Profesör', 'Final',
];

let state = null;
let timer = null;
let seenIds = new Set();
let answering = false;
let fiftyActive = false;
let firstAnswer = null;

const $ = (id) => document.getElementById(id);

export function getState() { return state; }

export function initState() {
  state = {
    questionIndex: 0,
    currentQuestion: null,
    shuffledOptions: [],
    jokers: { fifty: true, audience: true, skip: true },
    prize: 0,
    guaranteedPrize: 0,
    correctCount: 0,
    jokersUsed: 0,
    startTime: Date.now(),
  };
}

export async function newGame() {
  initState();
  await loadQuestions();
  seenIds = await storage.getSeenIds();
  const cloudSeen = await cloud.getSeenQuestionIds();
  cloudSeen.forEach(id => seenIds.add(id));
  showScreen('game');
  renderMoneyTree();
  await loadQuestion();
}

export async function continueGame() {
  const saved = storage.loadState();
  if (!saved) { await newGame(); return; }
  state = saved.state;
  seenIds = await storage.getSeenIds();
  showScreen('game');
  renderMoneyTree();
  await loadQuestion(state.questionIndex > 0 ? state.questionIndex : 0, true);
}

async function loadQuestion(idx, isRestore = false) {
  if (idx !== undefined) state.questionIndex = idx;
  answering = false;
  fiftyActive = false;
  firstAnswer = null;
  hideAudiencePanel();

  const difficulty = state.questionIndex + 1;
  const q = await pickQuestion(difficulty, seenIds);
  if (!q) { endGame(false, 'Soru bulunamadı.'); return; }

  state.currentQuestion = q;
  state.shuffledOptions = shuffleOptions(q);
  if (!isRestore) {
    storage.addSeenQuestion(q.id);
    seenIds.add(q.id);
    cloud.syncSeenQuestions([q.id]);
  }
  saveCurrent();

  renderQuestion(q);
  startTimer();
}

function startTimer() {
  const time = state.questionIndex < 5 ? 60 : 180;
  if (!timer) {
    timer = new Timer(() => onTimeout(), (sec) => {
      if (sec <= 5 && sec > 0) audio.playTick();
    });
  }
  timer.start(time);
}

function stopTimer() { if (timer) timer.stop(); }

function onTimeout() {
  audio.playLose();
  endGame(false, 'Süre doldu!');
}

function renderQuestion(q) {
  $('question-text').textContent = q.question;
  $('question-number').textContent = `Soru ${state.questionIndex + 1}/15`;
  $('tier-badge').textContent = TIER_NAMES[state.questionIndex] || 'Kolay';
  $('current-prize').textContent = formatPrize(state.prize);

  const optsEl = $('options');
  optsEl.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  state.shuffledOptions.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opt';
    btn.dataset.letter = letters[i];
    btn.dataset.value = opt;
    btn.textContent = opt;
    btn.setAttribute('aria-label', `${letters[i]}: ${opt}`);
    btn.addEventListener('click', () => onAnswer(btn, opt));
    optsEl.appendChild(btn);
  });
  updateJokerButtons();
  updateMoneyTreeActive();
}

function onAnswer(btn, value) {
  if (answering && !fiftyActive) return;
  if (fiftyActive && firstAnswer === null) {
    // First answer in fifty-fifty mode
    firstAnswer = { btn, value };
    btn.classList.add('selected');
    audio.playClick();
    return;
  }
  if (fiftyActive && firstAnswer) {
    // Second answer
    answering = true;
    stopTimer();
    const correctValue = state.currentQuestion.correct;
    revealAnswers([firstAnswer.btn, btn], [firstAnswer.value, value], correctValue);
    return;
  }
  answering = true;
  stopTimer();
  audio.playClick();
  const correctValue = state.currentQuestion.correct;
  revealAnswers([btn], [value], correctValue);
}

function revealAnswers(btns, values, correctValue) {
  const allOpts = document.querySelectorAll('.opt');
  allOpts.forEach(o => o.classList.add('revealed'));

  // Highlight correct
  allOpts.forEach(o => {
    if (o.dataset.value === correctValue) o.classList.add('correct');
  });

  const anyCorrect = values.some(v => v === correctValue);
  if (anyCorrect) {
    audio.playCorrect();
    burst(60);
    state.prize = PRIZES[state.questionIndex];
    state.correctCount++;
    if (BARAJ_INDEXES.includes(state.questionIndex)) {
      state.guaranteedPrize = PRIZES[state.questionIndex];
    }
    saveCurrent();
    updateMoneyTreeActive();
    setTimeout(() => {
      if (state.questionIndex >= FINAL_INDEX) {
        winGame();
      } else {
        state.questionIndex++;
        saveCurrent();
        loadQuestion();
      }
    }, 2000);
  } else {
    btns.forEach(b => { if (b.dataset.value !== correctValue) b.classList.add('wrong'); });
    audio.playWrong();
    document.body.classList.add('shake', 'lose-flash');
    setTimeout(() => document.body.classList.remove('shake', 'lose-flash'), 1200);
    setTimeout(() => endGame(false), 2500);
  }
}

function winGame() {
  stopTimer();
  audio.playWin();
  celebrate();
  endGame(true);
}

function endGame(won, message) {
  stopTimer();
  const prize = won ? PRIZES[FINAL_INDEX] : state.guaranteedPrize;
  const result = {
    won, prize,
    correctCount: state.correctCount,
    totalQuestions: state.questionIndex + 1,
    jokersUsed: state.jokersUsed,
  };
  storage.updateStats(result);
  storage.clearState();
  cloud.clearSession();
  cloud.submitScore(prize, result.correctCount, won ? 'won' : 'lost', result.totalQuestions, result.jokersUsed);

  showScreen('result');
  const icon = $('result-icon');
  icon.className = `result-icon ${won ? 'win' : 'lose'}`;
  icon.innerHTML = won ? '<i class="fa-solid fa-trophy"></i>' : '<i class="fa-solid fa-face-frown"></i>';
  $('result-title').textContent = won ? 'TEBRİKLER!' : 'KAYBETTİN';
  $('result-prize').textContent = formatPrize(prize) + ' TL';
  $('result-message').textContent = message || (won ? '10.000.000 TL kazandın!' : `Güvence altındaki ödül: ${formatPrize(prize)} TL`);
}

function renderMoneyTree() {
  const list = $('money-list');
  list.innerHTML = '';
  for (let i = PRIZES.length - 1; i >= 0; i--) {
    const li = document.createElement('li');
    li.className = 'money-item';
    li.dataset.index = i;
    if (BARAJ_INDEXES.includes(i)) li.classList.add('baraj');
    li.innerHTML = `<span class="mi-num">${i + 1}</span><span class="mi-amt">${formatPrize(PRIZES[i])} TL</span>`;
    list.appendChild(li);
  }
  updateMoneyTreeActive();
}

function updateMoneyTreeActive() {
  const items = document.querySelectorAll('.money-item');
  items.forEach(li => {
    const idx = parseInt(li.dataset.index, 10);
    li.classList.remove('active', 'passed', 'locked');
    if (idx < state.questionIndex) li.classList.add('passed');
    else if (idx === state.questionIndex) li.classList.add('active');
    else li.classList.add('locked');
  });
}

function updateJokerButtons() {
  const j = state.jokers;
  const setUsed = (id, used) => {
    const el = $(id);
    el.disabled = used;
    if (used) el.classList.add('used');
  };
  setUsed('joker-5050', !j.fifty);
  setUsed('joker-audience', !j.audience);
  setUsed('joker-skip', !j.skip);
}

export function useFifty() {
  if (!state.jokers.fifty || answering) return;
  state.jokers.fifty = false;
  state.jokersUsed++;
  fiftyActive = true;
  audio.playJoker();
  saveCurrent();
  updateJokerButtons();
  showToast('Çift Cevap hakkı aktif! İki şık seçebilirsin.');
}

export function useAudience() {
  if (!state.jokers.audience || answering) return;
  state.jokers.audience = false;
  state.jokersUsed++;
  audio.playJoker();
  saveCurrent();
  updateJokerButtons();
  showAudiencePanel();
}

export function useSkip() {
  if (!state.jokers.skip || answering) return;
  state.jokers.skip = false;
  state.jokersUsed++;
  audio.playJoker();
  saveCurrent();
  stopTimer();
  showToast('Soru geçildi.');
  loadQuestion();
}

function showAudiencePanel() {
  const panel = $('audience-panel');
  panel.classList.remove('hidden');
  const correct = state.currentQuestion.correct;
  const letters = ['A', 'B', 'C', 'D'];
  // Weighted distribution: correct answer gets majority most of the time
  const weights = state.shuffledOptions.map(opt => opt === correct ? 0.45 : 0.18);
  // Occasionally misleading (20% chance): make a wrong answer highest
  if (Math.random() < 0.2) {
    const wrongIdx = state.shuffledOptions.findIndex(o => o !== correct);
    if (wrongIdx >= 0) {
      weights[wrongIdx] = 0.4;
      weights[state.shuffledOptions.indexOf(correct)] = 0.25;
    }
  }
  // Normalize
  const sum = weights.reduce((a, b) => a + b, 0);
  const pcts = weights.map(w => Math.round((w / sum) * 100));
  // Fix rounding to sum 100
  const diff = 100 - pcts.reduce((a, b) => a + b, 0);
  if (pcts.length > 0) pcts[0] += diff;

  let html = '<div class="audience-bars">';
  pcts.forEach((pct, i) => {
    html += `<div class="audience-bar">
      <span class="audience-bar-pct">%${pct}</span>
      <div class="audience-bar-fill" style="height:0%"></div>
      <span class="audience-bar-label">${letters[i]}</span>
    </div>`;
  });
  html += '</div>';
  panel.innerHTML = html;
  // Animate bars
  requestAnimationFrame(() => {
    panel.querySelectorAll('.audience-bar-fill').forEach((bar, i) => {
      bar.style.height = pcts[i] + '%';
    });
  });
}

function hideAudiencePanel() {
  const panel = $('audience-panel');
  if (panel) panel.classList.add('hidden');
}

function saveCurrent() {
  storage.saveState({ state });
  cloud.saveSession({ ...state, seenIds: [...seenIds] });
}

export function quitGame() {
  stopTimer();
  saveCurrent();
  showScreen('start');
  updateStartScreen();
}

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(`${name}-screen`);
  if (el) el.classList.add('active');
}

export function formatPrize(n) { return n.toLocaleString('tr-TR'); }

let toastTimer = null;
export function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

export function updateStartScreen() {
  const saved = storage.loadState();
  const cont = $('btn-continue');
  if (saved && saved.state) cont.classList.remove('hidden');
  else cont.classList.add('hidden');
  if (cloud.isCloudEnabled()) {
    cloud.loadSession().then(session => {
      if (session && session.status === 'active' && !saved) {
        cont.classList.remove('hidden');
      }
    });
  }
}
