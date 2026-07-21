/**
 * Game data module — loads questions.json, filters seen questions,
 * picks questions by difficulty tier.
 */

import { getSeenIds } from './storage.js';

let questions = [];
let loaded = false;

export async function loadQuestions() {
  if (loaded) return questions;
  try {
    const res = await fetch('questions.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    questions = data.questions || [];
    loaded = true;
    return questions;
  } catch (e) {
    console.error('Failed to load questions.json', e);
    return [];
  }
}

export function getAllQuestions() { return questions; }

export async function pickQuestion(difficulty, excludeSet = null) {
  if (!loaded) await loadQuestions();
  let pool = questions.filter(q => q.difficulty === difficulty);
  if (excludeSet && excludeSet.size > 0) {
    const filtered = pool.filter(q => !excludeSet.has(q.id));
    if (filtered.length > 0) pool = filtered;
  }
  if (pool.length === 0) {
    // Fallback: any question at this difficulty ignoring exclusions
    pool = questions.filter(q => q.difficulty === difficulty);
  }
  if (pool.length === 0) {
    // Last resort: any question
    pool = questions;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function shuffleOptions(question) {
  const opts = [...question.options];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

export function getQuestionCount() { return questions.length; }
