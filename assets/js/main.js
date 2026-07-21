/**
 * Entry point — wires UI events to game controller.
 */

import * as game from './game.js';
import * as audio from './audio.js';
import * as storage from './storage.js';
import * as cloud from './supabase.js';

const $ = (id) => document.getElementById(id);

function showStats() {
  const stats = storage.loadStats();
  const el = $('stats-content');
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const acc = stats.totalQuestions > 0 ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100) : 0;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-val">${stats.gamesPlayed}</div><div class="stat-label">Oynanan Oyun</div></div>
    <div class="stat-card"><div class="stat-val">${stats.gamesWon}</div><div class="stat-label">Kazanılan</div></div>
    <div class="stat-card"><div class="stat-val">${game.formatPrize(stats.bestPrize)} ₺</div><div class="stat-label">En Yüksek Ödül</div></div>
    <div class="stat-card"><div class="stat-val">%${winRate}</div><div class="stat-label">Kazanma Oranı</div></div>
    <div class="stat-card"><div class="stat-val">%${acc}</div><div class="stat-label">Doğruluk</div></div>
    <div class="stat-card"><div class="stat-val">${stats.jokersUsed}</div><div class="stat-label">Kullanılan Joker</div></div>
  `;
  if (cloud.isCloudEnabled()) {
    cloud.getLeaderboard(10).then(board => {
      if (board.length === 0) return;
      const lbHtml = '<h3 class="lb-title"><i class="fa-solid fa-trophy"></i> Lider Tablosu</h3>' +
        '<ol class="lb-list">' + board.map((e, i) =>
          `<li class="lb-item"><span class="lb-rank">#${i + 1}</span><span class="lb-score">${game.formatPrize(e.score)} ₺</span><span class="lb-correct">${e.questions_correct} doğru</span></li>`
        ).join('') + '</ol>';
      el.insertAdjacentHTML('beforeend', lbHtml);
    });
  }
  $('stats-modal').classList.remove('hidden');
}

function closeModals() {
  $('stats-modal').classList.add('hidden');
  $('help-modal').classList.add('hidden');
}

function bindEvents() {
  $('btn-start').addEventListener('click', () => {
    audio.resumeAudio();
    audio.preloadSounds();
    audio.playStart();
    game.newGame();
  });
  $('btn-continue').addEventListener('click', () => {
    audio.resumeAudio();
    game.continueGame();
  });
  $('btn-stats').addEventListener('click', showStats);
  $('btn-help').addEventListener('click', () => $('help-modal').classList.remove('hidden'));
  $('stats-close').addEventListener('click', closeModals);
  $('help-close').addEventListener('click', closeModals);
  $('btn-quit').addEventListener('click', () => game.quitGame());
  $('btn-restart').addEventListener('click', () => game.newGame());
  $('btn-home').addEventListener('click', () => { game.showScreen('start'); game.updateStartScreen(); });
  $('joker-5050').addEventListener('click', () => game.useFifty());
  $('joker-audience').addEventListener('click', () => game.useAudience());
  $('joker-skip').addEventListener('click', () => game.useSkip());

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if ($('game-screen').classList.contains('active')) {
      const key = e.key.toLowerCase();
      const map = { a: 0, b: 1, c: 2, d: 3 };
      if (key in map) {
        const opts = document.querySelectorAll('.opt');
        if (opts[map[key]]) opts[map[key]].click();
      } else if (key === '1') game.useFifty();
      else if (key === '2') game.useAudience();
      else if (key === '3') game.useSkip();
      else if (key === 'escape') game.quitGame();
    }
  });

  // Close modal on backdrop click
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) closeModals(); });
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed', e));
    });
  }
}

bindEvents();
registerSW();
game.updateStartScreen();
