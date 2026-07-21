/**
 * Storage module — persistence via LocalStorage + IndexedDB.
 * Tracks game state, seen question IDs, stats, and achievements.
 */

const LS_KEY = 'kmo_state_v1';
const DB_NAME = 'kmo_db';
const DB_VERSION = 1;
const STORE_SEEN = 'seen_questions';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SEEN)) {
        db.createObjectStore(STORE_SEEN, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function addSeenQuestion(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SEEN, 'readwrite');
    tx.objectStore(STORE_SEEN).put({ id, ts: Date.now() });
    await new Promise(r => tx.oncomplete = r);
  } catch (e) { console.warn('addSeenQuestion failed', e); }
}

export async function getSeenIds() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SEEN, 'readonly');
    const req = tx.objectStore(STORE_SEEN).getAll();
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(new Set(req.result.map(r => r.id)));
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('getSeenIds failed', e);
    return new Set();
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('loadState failed', e);
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) { console.warn('saveState failed', e); }
}

export function clearState() {
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
}

const STATS_KEY = 'kmo_stats_v1';

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : {
      gamesPlayed: 0,
      gamesWon: 0,
      bestPrize: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      jokersUsed: 0,
      achievements: [],
    };
  } catch (e) {
    return { gamesPlayed: 0, gamesWon: 0, bestPrize: 0, totalCorrect: 0, totalQuestions: 0, jokersUsed: 0, achievements: [] };
  }
}

export function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
}

export function updateStats(result) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  if (result.won) stats.gamesWon += 1;
  if (result.prize > stats.bestPrize) stats.bestPrize = result.prize;
  stats.totalCorrect += result.correctCount || 0;
  stats.totalQuestions += result.totalQuestions || 0;
  stats.jokersUsed += result.jokersUsed || 0;
  saveStats(stats);
  return stats;
}
