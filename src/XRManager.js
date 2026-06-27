import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/**
 * WebXR manager for VR (Meta Quest) and AR sessions.
 *
 * IMPORTANT: enterVR() / enterAR() MUST be called synchronously from a user
 * click handler — never from setTimeout or a Promise chain, or the browser
 * will block the session request.
 */
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

    this._buildReticle();
  }

  // ── VR ──────────────────────────────────────────────────────────────────────

  enterVR() {
    if (!navigator.xr) { this._noXR(); return; }

    const btn = document.getElementById('xr-vr-btn');
    if (btn) btn.disabled = true;

    // If already in VR, exit
    const current = this.renderer.xr.getSession();
    if (current) { current.end(); return; }

    navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    }).then(session => {
      this._setupControllers();

      this.renderer.xr.addEventListener('sessionstart', () => {
        this._vrActive = true;
        this.onEnter?.('vr');
        if (btn) { btn.textContent = '⏹ Salir de VR'; btn.disabled = false; }
      });

      this.renderer.xr.addEventListener('sessionend', () => {
        this._vrActive = false;
        this.onExit?.('vr');
        if (btn) { btn.textContent = '🥽 Entrar en VR'; btn.disabled = false; }
      });

      return this.renderer.xr.setSession(session);
    }).catch(err => {
      console.error('VR session error:', err);
      alert('No se pudo iniciar VR.\n' + err.message + '\n\nAsegúrate de estar en Meta Quest Browser y la página se cargue por HTTPS.');
      if (btn) btn.disabled = false;
    });
  }

  // ── AR ──────────────────────────────────────────────────────────────────────

  enterAR() {
    if (!navigator.xr) { this._noXR(); return; }

    const btn = document.getElementById('xr-ar-btn');
    if (btn) btn.disabled = true;

    const current = this.renderer.xr.getSession();
    if (current) { current.end(); return; }

    navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body },
    }).then(session => {
      this.renderer.xr.addEventListener('sessionstart', () => {
        this._arActive = true;
        this.scene.background = null;
        this.onEnter?.('ar');
        if (btn) { btn.textContent = '⏹ Salir de AR'; btn.disabled = false; }
      });

      this.renderer.xr.addEventListener('sessionend', () => {
        this._arActive = false;
        this._reticle.visible = false;
        this._hitTestSource = null;
        this._hitTestSourceRequested = false;
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.onExit?.('ar');
        if (btn) { btn.textContent = '📷 Entrar en AR'; btn.disabled = false; }
      });

      return this.renderer.xr.setSession(session);
    }).catch(err => {
      console.error('AR session error:', err);
      alert('No se pudo iniciar AR.\n' + err.message);
      if (btn) btn.disabled = false;
    });
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(frame) {
    if (this._arActive && frame) this._updateAR(frame);
    if (this._vrActive) this._updateVR();
  }

  // ── AR hit-test ─────────────────────────────────────────────────────────────

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

  // ── VR controllers ──────────────────────────────────────────────────────────

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

      // Left squeeze → add cube, Right squeeze → delete selected
      ctrl.addEventListener('squeezestart', () => {
        if (i === 0) window.addPrimitive?.('cube');
        else window.doDelete?.();
      });

      this.scene.add(ctrl);
      this._controllers.push(ctrl);

      // Grip model
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      this.scene.add(grip);
      this._controllerGrips.push(grip);

      // Ray pointer
      const lineMat = new THREE.LineBasicMaterial({ color: i === 0 ? 0x4a9eff : 0xe94560 });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
      ]);
      const ray = new THREE.Line(lineGeo, lineMat);
      ray.scale.z = 5;
      ctrl.add(ray);
    }
  }

  // ── Reticle ─────────────────────────────────────────────────────────────────

  _buildReticle() {
    const geo = new THREE.RingGeometry(0.08, 0.12, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe94560, side: THREE.DoubleSide });
    this._reticle = new THREE.Mesh(geo, mat);
    this._reticle.matrixAutoUpdate = false;
    this._reticle.visible = false;
    this.scene.add(this._reticle);
  }

  _noXR() {
    alert('WebXR no disponible.\nEn Meta Quest abre esta página desde el navegador de Oculus (Meta Quest Browser).');
  }
}
