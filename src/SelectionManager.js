import * as THREE from 'three';

export class SelectionManager {
  constructor(scene, camera, renderer, sceneManager) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.sceneManager = sceneManager;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.1;
    this.raycaster.params.Line.threshold = 0.05;
  }

  castRay(pointer) {
    this.raycaster.setFromCamera(pointer, this.camera);
    return this.raycaster;
  }
}
