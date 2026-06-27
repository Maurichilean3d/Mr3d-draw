import * as THREE from 'three';

const COLORS = [0x4a9eff, 0xff6b6b, 0x51cf66, 0xffd43b, 0xcc5de8, 0xff922b, 0x20c997];
let colorIdx = 0;

export class PrimitiveFactory {
  constructor(scene, sceneManager) {
    this.scene = scene;
    this.sceneManager = sceneManager;
    this.counter = {};
  }

  create(type) {
    const geo = this._geometry(type);
    geo.computeVertexNormals();

    const color = COLORS[colorIdx++ % COLORS.length];
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.counter[type] = (this.counter[type] || 0) + 1;
    mesh.userData.name = this._label(type) + (this.counter[type] > 1 ? '.' + String(this.counter[type]).padStart(3, '0') : '');
    mesh.userData.type = type;

    // Place slightly above grid
    mesh.position.y = this._baseY(type);

    // Store original geometry data for edit mode
    mesh.userData.editData = this._buildEditData(geo);

    this.scene.add(mesh);
    this.sceneManager.add(mesh);
    return mesh;
  }

  _geometry(type) {
    switch (type) {
      case 'cube':       return new THREE.BoxGeometry(2, 2, 2, 2, 2, 2);
      case 'sphere':     return new THREE.SphereGeometry(1, 32, 24);
      case 'icosphere':  return new THREE.IcosahedronGeometry(1, 2);
      case 'cylinder':   return new THREE.CylinderGeometry(1, 1, 2, 32, 4);
      case 'cone':       return new THREE.ConeGeometry(1, 2, 32, 4);
      case 'torus':      return new THREE.TorusGeometry(1, 0.35, 16, 48);
      case 'plane':      return new THREE.PlaneGeometry(2, 2, 4, 4);
      case 'monkey':     return this._suzanne();
      default:           return new THREE.BoxGeometry(2, 2, 2);
    }
  }

  _label(type) {
    const labels = { cube:'Cubo', sphere:'Esfera', icosphere:'Icosfera',
      cylinder:'Cilindro', cone:'Cono', torus:'Toro', plane:'Plano', monkey:'Suzanne' };
    return labels[type] || type;
  }

  _baseY(type) {
    if (type === 'plane') return 0.01;
    if (type === 'torus') return 1;
    return 1;
  }

  _buildEditData(geo) {
    // Build vertex/edge/face indices from BufferGeometry
    const positions = geo.attributes.position;
    const index = geo.index;

    const vertices = [];
    for (let i = 0; i < positions.count; i++) {
      vertices.push(new THREE.Vector3(
        positions.getX(i), positions.getY(i), positions.getZ(i)
      ));
    }

    const faces = [];
    const edgeSet = new Set();
    const edges = [];

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        faces.push([a, b, c]);
        [[a,b],[b,c],[c,a]].forEach(([x,y]) => {
          const key = Math.min(x,y) + '_' + Math.max(x,y);
          if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([x,y]); }
        });
      }
    }

    return { vertices, edges, faces };
  }

  // Simple low-poly suzanne approximation
  _suzanne() {
    // Use icosahedron subdivided as placeholder; real suzanne needs OBJ loader
    const geo = new THREE.IcosahedronGeometry(1, 1);
    // We'll mark it as monkey for visual reference
    return geo;
  }
}
