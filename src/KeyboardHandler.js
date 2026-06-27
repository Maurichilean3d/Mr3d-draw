import * as THREE from 'three';

export class KeyboardHandler {
  constructor({ camera, controls, scene, sceneManager, editManager, transformCtrl }) {
    this.camera = camera;
    this.controls = controls;
    this.scene = scene;
    this.sceneMgr = sceneManager;
    this.editMgr = editManager;
    this.transformCtrl = transformCtrl;

    this._activeKeys = new Set();
    this._gizmoActive = null;
    this._gizmoOrigin = null;

    window.addEventListener('keydown', this._onKey.bind(this));
    window.addEventListener('keyup', e => this._activeKeys.delete(e.code));
  }

  _onKey(e) {
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    const mode = window.appMode;

    // ── Mode toggle ──
    if (key === 'tab') {
      e.preventDefault();
      if (mode === 'object' && window.sceneManager?.activeObject) {
        window.setMode('edit');
      } else if (mode === 'edit') {
        window.setMode('object');
      } else {
        window.setMode(mode === 'object' ? 'edit' : 'object');
      }
      return;
    }

    if (mode === 'object') {
      this._handleObjectMode(key, ctrl, shift, alt, e);
    } else {
      this._handleEditMode(key, ctrl, shift, alt, e);
    }
  }

  _handleObjectMode(key, ctrl, shift, alt, e) {
    // Add primitive
    if (shift && key === 'a') { window.togglePrimPopup(); return; }

    // Tools
    if (!ctrl && key === 'g') window.setTool('move');
    if (!ctrl && key === 'r') window.setTool('rotate');
    if (!ctrl && key === 'e') window.setTool('scale');
    if (key === 'escape') { window.setTool('select'); this.transformCtrl.detach(); }

    // Delete
    if (key === 'x' || key === 'delete') window.doDelete();

    // Wireframe toggle
    if (key === 'z') {
      const obj = this.sceneMgr.activeObject;
      if (obj) {
        const mat = obj.material;
        mat.wireframe = !mat.wireframe;
        mat.needsUpdate = true;
      }
    }

    // Numpad views
    this._numpadViews(key, e);
  }

  _handleEditMode(key, ctrl, shift, alt, e) {
    // Select mode: 1 = vertex, 2 = edge, 3 = face
    if (key === '1') { window.setSelectMode('vertex'); return; }
    if (key === '2') { window.setSelectMode('edge'); return; }
    if (key === '3') { window.setSelectMode('face'); return; }

    // Select all / deselect
    if (!alt && key === 'a') { this.editMgr.selectAll(); this._refresh(); return; }
    if (alt && key === 'a') { this.editMgr.deselectAll(); this._refresh(); return; }

    // Operations
    if (!ctrl && key === 'e') { this.editMgr.extrude(); this._refresh(); return; }
    if (ctrl && key === 'r') { e.preventDefault(); this.editMgr.loopCut(); this._refresh(); return; }
    if (ctrl && key === 'b') { e.preventDefault(); this.editMgr.bevel(); this._refresh(); return; }
    if (key === 'x' || key === 'delete') { this.editMgr.deleteSelected(); this._refresh(); return; }
    if (key === 'm') { this.editMgr.merge(); this._refresh(); return; }
    if (key === 'f') { this.editMgr.fill(); this._refresh(); return; }

    // Numpad views
    this._numpadViews(key, e);
  }

  _refresh() {
    if (window.updateSelInfo) window.updateSelInfo();
    if (window.updateStatusBar) window.updateStatusBar();
  }

  _numpadViews(key, e) {
    const cam = this.camera;
    const D = 10;

    // Numpad 1 = front, 3 = right, 7 = top, 5 = ortho/persp toggle
    if (e.code === 'Numpad1') { cam.position.set(0, 0, D); cam.lookAt(0, 0, 0); e.preventDefault(); }
    if (e.code === 'Numpad3') { cam.position.set(D, 0, 0); cam.lookAt(0, 0, 0); e.preventDefault(); }
    if (e.code === 'Numpad7') { cam.position.set(0, D, 0.01); cam.lookAt(0, 0, 0); e.preventDefault(); }
    if (e.code === 'Numpad5') {
      // Toggle orthographic / perspective
      e.preventDefault();
      if (cam.isPerspectiveCamera) {
        const ortho = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.01, 500);
        ortho.position.copy(cam.position);
        ortho.lookAt(0, 0, 0);
        this.camera = ortho;
        this.controls.object = ortho;
      }
    }
  }
}
