/**
 * Confetti effect — lightweight canvas confetti for correct answers and wins.
 */

const canvas = document.getElementById('confetti-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let particles = [];
let rafId = null;

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const COLORS = ['#ffd700', '#2ecc71', '#4a9eff', '#ff6b6b', '#f5f9ff', '#ffb700'];

function spawn(count, x, y) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x ?? Math.random() * canvas.width,
      y: y ?? -20,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 4 + 2,
      size: Math.random() * 8 + 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      life: 1,
    });
  }
}

function tick() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0 && p.y < canvas.height + 50);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.rot += p.vrot;
    p.life -= 0.005;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  if (particles.length > 0) {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = null;
  }
}

export function burst(count = 80) {
  if (!canvas) return;
  spawn(count, canvas.width / 2, canvas.height / 3);
  if (!rafId) rafId = requestAnimationFrame(tick);
}

export function celebrate() {
  if (!canvas) return;
  let i = 0;
  const interval = setInterval(() => {
    spawn(40, Math.random() * canvas.width, -20);
    i++;
    if (i > 8) clearInterval(interval);
  }, 200);
  if (!rafId) rafId = requestAnimationFrame(tick);
}

export function clearConfetti() {
  particles = [];
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
