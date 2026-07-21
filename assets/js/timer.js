/**
 * Timer module — SVG progress ring countdown.
 * 60s before 50.000 TL baraj, 180s after.
 */

export class Timer {
  constructor(onExpire, onTick) {
    this.onExpire = onExpire;
    this.onTick = onTick;
    this.total = 60;
    this.remaining = 60;
    this.intervalId = null;
    this.running = false;
    this.ring = document.querySelector('.timer-progress');
    this.text = document.getElementById('timer-text');
    this.wrap = document.querySelector('.timer-wrap');
    this.circumference = 2 * Math.PI * 44;
  }

  start(seconds) {
    this.stop();
    this.total = seconds;
    this.remaining = seconds;
    this.running = true;
    this.update();
    this.intervalId = setInterval(() => {
      this.remaining--;
      this.update();
      if (this.onTick) this.onTick(this.remaining);
      if (this.remaining <= 0) {
        this.stop();
        if (this.onExpire) this.onExpire();
      }
    }, 1000);
  }

  stop() {
    this.running = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  pause() { this.stop(); }
  resume() {
    if (this.remaining > 0) {
      this.running = true;
      this.update();
      this.intervalId = setInterval(() => {
        this.remaining--;
        this.update();
        if (this.onTick) this.onTick(this.remaining);
        if (this.remaining <= 0) { this.stop(); if (this.onExpire) this.onExpire(); }
      }, 1000);
    }
  }

  update() {
    if (!this.ring || !this.text) return;
    const pct = Math.max(0, this.remaining / this.total);
    const offset = this.circumference * (1 - pct);
    this.ring.style.strokeDashoffset = offset;
    this.text.textContent = this.remaining;
    if (this.remaining <= 5) {
      this.wrap.classList.add('warning');
    } else {
      this.wrap.classList.remove('warning');
    }
  }

  isWarning() { return this.remaining <= 5 && this.running; }
}
