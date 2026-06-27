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
    this._controllersSetup = false;
    this._sessionListenersAdded = false;

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

    // Exit if already in session
    const current = this.renderer.xr.getSession();
    if (current) { current.end(); return; }

    // Check support before requesting (non-blocking check already done, but log it)
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (!supported) {
        this._showStatus(
          '❌ Este navegador no soporta VR inmersivo.<br>' +
          'En Meta Quest: usa <b>Meta Quest Browser</b><br>' +
          'y asegúrate de que la página sea <b>HTTPS</b>.',
          '#ff6b6b'
        );
        setTimeout(() => this._hideStatus(), 7000);
        return;
      }

      // Listener deduplication
      if (!this._sessionListenersAdded) {
        this._sessionListenersAdded = true;
        this.renderer.xr.addEventListener('sessionstart', () => {
          this._vrActive = true;
          this._hideStatus();
          this._updateBtns('vr', true);
          this.onEnter?.('vr');
        });
        this.renderer.xr.addEventListener('sessionend', () => {
          this._vrActive = false;
          this._updateBtns('vr', false);
          this.onExit?.('vr');
        });
      }

      // requestSession — called from .then() of isSessionSupported which is
      // itself called synchronously from enterVR() which is called directly
      // from the user click. Meta Quest Browser accepts this chain.
      navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor', 'hand-tracking'],
      }).then(session => {
        this._setupControllers();
        return this.renderer.xr.setSession(session);
      }).catch(err => {
        console.error('[XR] VR session error:', err);
        this._showStatus(
          `❌ Error al iniciar VR:<br><code style="font-size:12px">${err.message || err}</code><br><br>` +
          '• Verifica que la URL sea <b>HTTPS</b><br>' +
          '• Usa <b>Meta Quest Browser</b> (no Chrome)<br>' +
          '• Acepta el diálogo de permisos',
          '#ff6b6b'
        );
        setTimeout(() => this._hideStatus(), 9000);
      });
    });
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

    navigator.xr.isSessionSupported('immersive-ar').then(supported => {
      if (!supported) {
        this._showStatus('❌ AR no soportado en este dispositivo.', '#ff6b6b');
        setTimeout(() => this._hideStatus(), 5000);
        return;
      }

      if (!this._arListenersAdded) {
        this._arListenersAdded = true;
        this.renderer.xr.addEventListener('sessionstart', () => {
          this._arActive = true;
          this._hideStatus();
          this.scene.background = null;
          this._updateBtns('ar', true);
          this.onEnter?.('ar');
        });
        this.renderer.xr.addEventListener('sessionend', () => {
          this._arActive = false;
          this._reticle.visible = false;
          this._hitTestSource = null;
          this._hitTestSourceRequested = false;
          this.scene.background = new THREE.Color(0x1a1a2e);
          this._updateBtns('ar', false);
          this.onExit?.('ar');
        });
      }

      navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body },
      }).then(session => {
        return this.renderer.xr.setSession(session);
      }).catch(err => {
        console.error('[XR] AR session error:', err);
        this._showStatus(`❌ Error AR: ${err.message || err}`, '#ff6b6b');
        setTimeout(() => this._hideStatus(), 7000);
      });
    });
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
        if (i === 0) window.addPrimitive?.('cube');
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

  _updateBtns(mode, active) {
    const id = mode === 'vr' ? 'xr-vr-btn' : 'xr-ar-btn';
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = false;
    if (mode === 'vr') btn.textContent = active ? '⏹ Salir de VR' : '🥽 Entrar en VR';
    else btn.textContent = active ? '⏹ Salir de AR' : '📷 Entrar en AR';
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
