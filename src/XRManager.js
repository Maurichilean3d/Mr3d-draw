import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/**
 * Manages WebXR sessions (VR + AR) including Meta Quest controller input.
 * In VR mode: right trigger selects / interacts, left joystick moves.
 * In AR mode: tap on hit-test surface to place objects.
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

    this._session = null;
    this._hitTestSource = null;
    this._hitTestSourceRequested = false;
    this._reticle = null;
    this._controllers = [];
    this._raycaster = new THREE.Raycaster();
    this._tempMatrix = new THREE.Matrix4();
    this._vrActive = false;
    this._arActive = false;

    this._buildReticle();
    this._buildVRUI();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async enterVR() {
    if (!navigator.xr) return this._noXR();
    try {
      this._setupControllers();
      const btn = document.getElementById('xr-vr-btn');
      if (btn) btn.textContent = '⏹ Salir de VR';

      this.renderer.xr.addEventListener('sessionstart', () => {
        this._vrActive = true;
        this.onEnter?.('vr');
        this._showVRUI();
      });
      this.renderer.xr.addEventListener('sessionend', () => {
        this._vrActive = false;
        this._hideVRUI();
        this.onExit?.('vr');
      });

      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      await this.renderer.xr.setSession(session);
    } catch (err) {
      console.error('VR session failed:', err);
      alert('No se pudo iniciar VR: ' + err.message);
    }
  }

  async enterAR() {
    if (!navigator.xr) return this._noXR();
    try {
      this._buildReticle();
      this.renderer.xr.addEventListener('sessionstart', async () => {
        this._arActive = true;
        this.onEnter?.('ar');
        this.scene.background = null;
      });
      this.renderer.xr.addEventListener('sessionend', () => {
        this._arActive = false;
        this._reticle.visible = false;
        this.scene.background = new THREE.Color(0x1a1a2e);
        this._hitTestSource = null;
        this._hitTestSourceRequested = false;
        this.onExit?.('ar');
      });

      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('ar-overlay') || document.body },
      });
      await this.renderer.xr.setSession(session);
    } catch (err) {
      console.error('AR session failed:', err);
      alert('No se pudo iniciar AR: ' + err.message);
    }
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(frame) {
    if (this._arActive) this._updateAR(frame);
    if (this._vrActive) this._updateVR();
  }

  // ── AR ──────────────────────────────────────────────────────────────────────

  _updateAR(frame) {
    if (!frame) return;
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
        const hit = results[0];
        const pose = hit.getPose(refSpace);
        this._reticle.visible = true;
        this._reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        this._reticle.visible = false;
      }
    }
  }

  _placeObjectAR() {
    if (!this._reticle.visible || !this._arActive) return;
    const mesh = this.primFactory.create('cube');
    mesh.position.setFromMatrixPosition(this._reticle.matrix);
    this.sceneMgr.select(mesh);
  }

  // ── VR ──────────────────────────────────────────────────────────────────────

  _updateVR() {
    this._controllers.forEach(ctrl => {
      if (ctrl.userData.isSelecting) {
        this._tempMatrix.identity().extractRotation(ctrl.matrixWorld);
        this._raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMatrix);

        const hits = this._raycaster.intersectObjects(this.sceneMgr.meshes, false);
        if (hits.length > 0) {
          this.sceneMgr.select(hits[0].object);
        }
      }
    });
  }

  _setupControllers() {
    const factory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);
      ctrl.addEventListener('selectstart', () => { ctrl.userData.isSelecting = true; });
      ctrl.addEventListener('selectend', () => {
        ctrl.userData.isSelecting = false;
        // Tap in AR = place object
        if (this._arActive) this._placeObjectAR();
      });
      ctrl.addEventListener('squeezestart', () => {
        // Right squeeze = add cube, left squeeze = delete
        if (i === 0) this.primFactory.create('cube');
      });
      this.scene.add(ctrl);
      this._controllers.push(ctrl);

      // Controller grip model
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      this.scene.add(grip);

      // Ray line
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
        ]),
        new THREE.LineBasicMaterial({ color: 0xe94560 })
      );
      ray.scale.z = 5;
      ctrl.add(ray);
    }
  }

  // ── VR UI (floating panel in world space) ──────────────────────────────────

  _buildVRUI() {
    // Floating panel attached to left controller in VR — built lazily on enter
  }

  _showVRUI() {
    // Show a simple world-space tooltip (done via HTML overlay for now)
    let hint = document.getElementById('vr-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'vr-hint';
      hint.style.cssText = `
        position:fixed;bottom:40px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,.7);color:#fff;padding:10px 20px;border-radius:8px;
        font-size:13px;text-align:center;z-index:500;pointer-events:none;
      `;
      hint.innerHTML = '🥽 VR Activo · <b>Gatillo derecho</b>: seleccionar · <b>Squeeze izq.</b>: añadir cubo';
      document.body.appendChild(hint);
    }
    hint.style.display = 'block';
  }

  _hideVRUI() {
    document.getElementById('vr-hint')?.remove();
  }

  // ── Reticle (AR) ───────────────────────────────────────────────────────────

  _buildReticle() {
    if (this._reticle) { this.scene.remove(this._reticle); }
    const geo = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe94560, side: THREE.DoubleSide });
    this._reticle = new THREE.Mesh(geo, mat);
    this._reticle.matrixAutoUpdate = false;
    this._reticle.visible = false;
    this.scene.add(this._reticle);
  }

  _noXR() {
    alert('WebXR no está disponible en este navegador.\nEn Meta Quest usa el navegador de Oculus.');
  }
}
