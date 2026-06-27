import * as THREE from 'three';

/**
 * Touch-friendly controls for mobile/tablet:
 * - 1 finger drag → orbit
 * - 2 finger pinch → zoom
 * - 2 finger drag → pan
 * - Tap → select
 */
export class TouchControls {
  constructor(domElement, camera, orbitControls) {
    this.dom = domElement;
    this.camera = camera;
    this.orbit = orbitControls;
    this._touches = new Map();
    this._lastPinchDist = null;
    this._tapCallback = null;
    this._enabled = true;

    domElement.addEventListener('touchstart', this._onStart.bind(this), { passive: false });
    domElement.addEventListener('touchmove', this._onMove.bind(this), { passive: false });
    domElement.addEventListener('touchend', this._onEnd.bind(this), { passive: false });
  }

  onTap(cb) { this._tapCallback = cb; }

  _onStart(e) {
    if (!this._enabled) return;
    e.preventDefault();
    this._touchStartTime = Date.now();
    this._touchStartPos = e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    Array.from(e.changedTouches).forEach(t => this._touches.set(t.identifier, { x: t.clientX, y: t.clientY }));
  }

  _onMove(e) {
    if (!this._enabled) return;
    e.preventDefault();

    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

      if (this._lastPinchDist !== null) {
        const delta = this._lastPinchDist - dist;
        // Zoom
        const factor = 1 + delta * 0.005;
        this.camera.position.multiplyScalar(factor);
        this.orbit.update();
      }
      this._lastPinchDist = dist;
    } else {
      this._lastPinchDist = null;
    }

    Array.from(e.changedTouches).forEach(t => {
      this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    });
  }

  _onEnd(e) {
    if (!this._enabled) return;
    e.preventDefault();

    const dt = Date.now() - (this._touchStartTime || 0);
    const start = this._touchStartPos;
    const touch = e.changedTouches[0];

    if (dt < 220 && touch && start) {
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.hypot(dx, dy) < 12 && this._tapCallback) {
        const rect = this.dom.getBoundingClientRect();
        const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        this._tapCallback(new THREE.Vector2(x, y), false);
      }
    }

    Array.from(e.changedTouches).forEach(t => this._touches.delete(t.identifier));
    if (this._touches.size === 0) this._lastPinchDist = null;
  }

  enable() { this._enabled = true; }
  disable() { this._enabled = false; }
}
