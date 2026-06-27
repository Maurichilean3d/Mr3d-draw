import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class XRManager {
  constructor({ renderer, scene, camera, sceneManager, primFactory, onEnter, onExit }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sceneMgr = sceneManager;
    this.primFactory = primFactory;
    this.onEnter = onEnter;
    this.onExit = onExit;

    this._hitTestSource = null;
    this._hitTestSourceRequested = false;
    this._reticle = null;
    this._controllers = [];
    this._controllerGrips = [];
    this._raycaster = new THREE.Raycaster();
    this._tempMatrix = new THREE.Matrix4();
    this._vrActive = false;
    this._arActive = false;
    this._activeMode = null;
    this._sessionPending = false;
    this._controllersSetup = false;

    this._buildReticle();
    this._buildStatusOverlay();
  }

  // ── Status overlay (visible on Quest, no alert()) ─────────────────────────

  _buildStatusOverlay() {
    const el = document.createElement('div');
    el.id = 'xr-status';
    el.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(0,0,0,.85);color:#fff;padding:20px 28px;
      border-radius:12px;font-size:16px;text-align:center;
      z-index:9000;display:none;max-width:90vw;line-height:1.7;
      border:1px solid #e94560;
    `;
    document.body.appendChild(el);
    this._statusEl = el;
  }

  _showStatus(msg, color = '#fff') {
    this._statusEl.innerHTML = msg;
    this._statusEl.style.color = color;
    this._statusEl.style.display = 'block';
  }

  _hideStatus() {
    this._statusEl.style.display = 'none';
  }

  // ── VR ───────────────────────────────────────────────────────────────────────

  enterVR() {
    this._showStatus('⏳ Iniciando VR…');

    if (!navigator.xr) {
      this._showStatus('❌ WebXR no disponible.<br>Abre esta página desde <b>Meta Quest Browser</b>.', '#ff6b6b');
      setTimeout(() => this._hideStatus(), 5000);
      return;
    }

    const current = this.renderer.xr.getSession();
    if (current) { current.end(); return; }
    if (this._sessionPending) return;

    // This call must happen in the original click stack. Checking support with
    // an awaited promise first makes Quest Browser reject the user activation.
    this._sessionPending = true;
    let request;
    try {
      request = navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor', 'hand-tracking'],
      });
    } catch (err) {
      this._sessionError(err, 'VR');
      return;
    }

    request
      .then(session => this._beginSession(session, 'vr'))
      .catch(err => this._sessionError(err, 'VR'));
  }

  // ── AR ───────────────────────────────────────────────────────────────────────

  enterAR() {
    this._showStatus('⏳ Iniciando AR…');

    if (!navigator.xr) {
      this._showStatus('❌ WebXR no disponible en este navegador.', '#ff6b6b');
      setTimeout(() => this._hideStatus(), 5000);
      return;
    }

    const current = this.renderer.xr.getSession();
    if (current) { current.end(); return; }
    if (this._sessionPending) return;

    this._sessionPending = true;
    let request;
    try {
      request = navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body },
      });
    } catch (err) {
      this._sessionError(err, 'AR');
      return;
    }

    request
      .then(session => this._beginSession(session, 'ar'))
      .catch(err => this._sessionError(err, 'AR'));
  }

  async _beginSession(session, mode) {
    try {
      session.addEventListener('end', () => this._endSession(mode), { once: true });
      if (mode === 'vr') this._setupControllers();
      await this.renderer.xr.setSession(session);

      this._sessionPending = false;
      this._activeMode = mode;
      this._vrActive = mode === 'vr';
      this._arActive = mode === 'ar';
      if (mode === 'ar') this.scene.background = null;

      this._hideStatus();
      this._updateBtns(mode, true);
      this.onEnter?.(mode);
    } catch (err) {
      try { await session.end(); } catch {}
      this._sessionError(err, mode.toUpperCase());
    }
  }

  _endSession(mode) {
    this._sessionPending = false;
    this._activeMode = null;
    this._vrActive = false;
    this._arActive = false;
    this._reticle.visible = false;
    this._hitTestSource?.cancel?.();
    this._hitTestSource = null;
    this._hitTestSourceRequested = false;
    this._updateBtns(mode, false);
    this.onExit?.(mode);
  }

  _sessionError(err, label) {
    this._sessionPending = false;
    console.error(`[XR] ${label} session error:`, err);
    const reason = err?.name === 'NotSupportedError'
      ? 'Este modo no está disponible en el dispositivo.'
      : (err?.message || String(err));
    this._showStatus(
      `❌ Error al iniciar ${label}:<br><code style="font-size:12px">${reason}</code><br><br>` +
      '• Abre el sitio por <b>HTTPS</b><br>' +
      '• Usa <b>Meta Quest Browser</b><br>' +
      '• Acepta el permiso de realidad virtual',
      '#ff6b6b'
    );
    setTimeout(() => this._hideStatus(), 9000);
  }

  // ── Per-frame ────────────────────────────────────────────────────────────────

  update(frame) {
    if (this._arActive && frame) this._updateAR(frame);
    if (this._vrActive) this._updateVR();
  }

  // ── AR hit-test ──────────────────────────────────────────────────────────────

  _updateAR(frame) {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    if (!this._hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then(refSpace => {
        session.requestHitTestSource({ space: refSpace }).then(src => {
          this._hitTestSource = src;
        });
      });
      session.addEventListener('end', () => {
        this._hitTestSourceRequested = false;
        this._hitTestSource = null;
      });
      this._hitTestSourceRequested = true;
    }

    const refSpace = this.renderer.xr.getReferenceSpace();
    if (this._hitTestSource && refSpace) {
      const results = frame.getHitTestResults(this._hitTestSource);
      if (results.length > 0) {
        const pose = results[0].getPose(refSpace);
        this._reticle.visible = true;
        this._reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        this._reticle.visible = false;
      }
    }
  }

  placeObjectAR() {
    if (!this._reticle.visible || !this._arActive) return;
    const mesh = this.primFactory.create('cube');
    mesh.position.setFromMatrixPosition(this._reticle.matrix);
    this.sceneMgr.select(mesh);
  }

  // ── VR controllers ───────────────────────────────────────────────────────────

  _updateVR() {
    this._controllers.forEach(ctrl => {
      if (!ctrl.userData.isSelecting) return;
      this._tempMatrix.identity().extractRotation(ctrl.matrixWorld);
      this._raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
      this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMatrix);
      const hits = this._raycaster.intersectObjects(this.sceneMgr.meshes, false);
      if (hits.length > 0) this.sceneMgr.select(hits[0].object);
    });
  }

  _setupControllers() {
    if (this._controllersSetup) return;
    this._controllersSetup = true;

    const factory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);

      ctrl.addEventListener('selectstart', () => { ctrl.userData.isSelecting = true; });
      ctrl.addEventListener('selectend', () => {
        ctrl.userData.isSelecting = false;
        if (this._arActive) this.placeObjectAR();
      });
      ctrl.addEventListener('squeezestart', () => {
        if (i === 0) this._createCubeAtController(ctrl);
        else window.doDelete?.();
      });

      this.scene.add(ctrl);
      this._controllers.push(ctrl);

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      this.scene.add(grip);
      this._controllerGrips.push(grip);

      // Ray line
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]),
        new THREE.LineBasicMaterial({ color: i === 0 ? 0x4a9eff : 0xe94560 })
      );
      ray.scale.z = 5;
      ctrl.add(ray);
    }
  }

  _createCubeAtController(controller) {
    const mesh = this.primFactory.create('cube');
    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
    controller.getWorldPosition(mesh.position);
    mesh.position.addScaledVector(direction, 1.5);
    mesh.scale.setScalar(0.25);
    this.sceneMgr.select(mesh);
    window.updateStatusBar?.();
  }

  _updateBtns(mode, active) {
    const id = mode === 'vr' ? 'xr-vr-btn' : 'xr-ar-btn';
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = false;
      if (mode === 'vr') btn.textContent = active ? '⏹ Salir de VR' : '🥽 Entrar en VR';
      else btn.textContent = active ? '⏹ Salir de AR' : '📷 Entrar en AR';
    }

    if (mode === 'vr') {
      const floating = document.getElementById('floating-vr-btn');
      if (floating) floating.textContent = active ? '⏹ Salir VR' : '🥽 VR';
    }
  }

  // ── Reticle ──────────────────────────────────────────────────────────────────

  _buildReticle() {
    const geo = new THREE.RingGeometry(0.08, 0.12, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe94560, side: THREE.DoubleSide });
    this._reticle = new THREE.Mesh(geo, mat);
    this._reticle.matrixAutoUpdate = false;
    this._reticle.visible = false;
    this.scene.add(this._reticle);
  }
}
