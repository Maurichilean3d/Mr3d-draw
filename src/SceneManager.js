import * as THREE from 'three';

export class SceneManager {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.activeObject = null;
    this._outlineMesh = null;
  }

  add(mesh) {
    this.meshes.push(mesh);
  }

  remove(mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
    else mesh.material?.dispose();
    const idx = this.meshes.indexOf(mesh);
    if (idx !== -1) this.meshes.splice(idx, 1);
    if (this.activeObject === mesh) {
      this.activeObject = null;
      this._removeOutline();
    }
  }

  select(mesh) {
    this._removeOutline();
    this.activeObject = mesh;
    this._addOutline(mesh);
  }

  deselect() {
    this._removeOutline();
    this.activeObject = null;
  }

  _addOutline(mesh) {
    const outGeo = mesh.geometry.clone();
    const outMat = new THREE.MeshBasicMaterial({
      color: 0xe94560,
      side: THREE.BackSide,
    });
    const outMesh = new THREE.Mesh(outGeo, outMat);
    outMesh.scale.multiplyScalar(1.025);
    outMesh.userData.isOutline = true;
    mesh.add(outMesh);
    this._outlineMesh = outMesh;
  }

  _removeOutline() {
    if (this._outlineMesh) {
      this._outlineMesh.parent?.remove(this._outlineMesh);
      this._outlineMesh.geometry.dispose();
      this._outlineMesh.material.dispose();
      this._outlineMesh = null;
    }
  }
}
