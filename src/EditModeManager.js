import * as THREE from 'three';

/**
 * Manages Edit Mode: vertex / edge / face selection and basic operations
 * (extrude, delete, merge, fill, loop-cut, bevel).
 *
 * Works on a copy of the mesh geometry kept in sync via _rebuildGeometry().
 */
export class EditModeManager {
  constructor(scene, selectionManager, sceneManager) {
    this.scene = scene;
    this.selMgr = selectionManager;
    this.sceneMgr = sceneManager;

    this.active = false;
    this.mesh = null;
    this.selectMode = 'vertex'; // 'vertex' | 'edge' | 'face'

    // Geometry data
    this.vertices = [];     // THREE.Vector3[] in local space
    this.edges = [];        // [i,j][]
    this.faces = [];        // [a,b,c][]

    // Selection
    this.selVerts = new Set();
    this.selEdges = new Set();
    this.selFaces = new Set();

    // Three.js overlay objects
    this._pointCloud = null;
    this._edgeLines = null;
    this._faceOverlay = null;
  }

  // ── Enter / Exit ───────────────────────────────────────────────────────────

  enter(mesh) {
    if (!mesh) return;
    this.active = true;
    this.mesh = mesh;
    mesh.visible = true;

    // Parse geometry
    this._parseGeometry(mesh.geometry);

    // Hide the object's own material (we show overlay instead)
    this._origMaterial = mesh.material;
    mesh.material = new THREE.MeshStandardMaterial({
      color: this._origMaterial.color?.clone() || new THREE.Color(0x4a9eff),
      roughness: 0.5,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this._buildOverlay();
  }

  exit() {
    if (!this.active) return;
    this.active = false;

    // Restore material
    if (this.mesh && this._origMaterial) {
      this.mesh.material.dispose();
      this.mesh.material = this._origMaterial;
    }

    this._removeOverlay();
    this.selVerts.clear();
    this.selEdges.clear();
    this.selFaces.clear();
    this.mesh = null;
  }

  // ── Geometry parsing ───────────────────────────────────────────────────────

  _parseGeometry(geo) {
    const pos = geo.attributes.position;
    const idx = geo.index;

    this.vertices = [];
    this.edges = [];
    this.faces = [];

    // Deduplicate vertices by position (within threshold)
    const THRESH = 1e-4;
    const uniqueVerts = [];
    const remap = new Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      let found = -1;
      for (let j = 0; j < uniqueVerts.length; j++) {
        if (uniqueVerts[j].distanceTo(v) < THRESH) { found = j; break; }
      }
      if (found === -1) { found = uniqueVerts.length; uniqueVerts.push(v.clone()); }
      remap[i] = found;
    }
    this.vertices = uniqueVerts;

    // Build faces & edges using remapped indices
    const edgeSet = new Map();
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = remap[idx.getX(i)];
        const b = remap[idx.getX(i + 1)];
        const c = remap[idx.getX(i + 2)];
        this.faces.push([a, b, c]);
        [[a,b],[b,c],[c,a]].forEach(([x,y]) => {
          const key = Math.min(x,y) + '_' + Math.max(x,y);
          if (!edgeSet.has(key)) { edgeSet.set(key, this.edges.length); this.edges.push([x,y]); }
        });
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        const a = remap[i], b = remap[i+1], c = remap[i+2];
        this.faces.push([a, b, c]);
        [[a,b],[b,c],[c,a]].forEach(([x,y]) => {
          const key = Math.min(x,y) + '_' + Math.max(x,y);
          if (!edgeSet.has(key)) { edgeSet.set(key, this.edges.length); this.edges.push([x,y]); }
        });
      }
    }
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  _buildOverlay() {
    this._removeOverlay();

    // ── Vertices ──
    const pointGeo = new THREE.BufferGeometry();
    const vArr = new Float32Array(this.vertices.length * 3);
    this.vertices.forEach((v, i) => { vArr[i*3]=v.x; vArr[i*3+1]=v.y; vArr[i*3+2]=v.z; });
    pointGeo.setAttribute('position', new THREE.BufferAttribute(vArr, 3));
    const pointMat = new THREE.PointsMaterial({ color: 0xffffff, size: 8, sizeAttenuation: false, depthTest: false });
    this._pointCloud = new THREE.Points(pointGeo, pointMat);
    this._pointCloud.renderOrder = 2;
    this.mesh.add(this._pointCloud);

    // ── Edges ──
    const edgePositions = [];
    this.edges.forEach(([a, b]) => {
      const va = this.vertices[a], vb = this.vertices[b];
      edgePositions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePositions), 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x888888, depthTest: false, transparent: true, opacity: 0.7 });
    this._edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    this._edgeLines.renderOrder = 1;
    this.mesh.add(this._edgeLines);

    // ── Face overlay (invisible until selected) ──
    this._faceOverlay = new THREE.Group();
    this.faces.forEach((f, fi) => {
      const geo = new THREE.BufferGeometry();
      const va = this.vertices[f[0]], vb = this.vertices[f[1]], vc = this.vertices[f[2]];
      geo.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([va.x,va.y,va.z, vb.x,vb.y,vb.z, vc.x,vc.y,vc.z]), 3
      ));
      geo.setIndex([0,1,2]);
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({
        color: 0x4a9eff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
      });
      const faceMesh = new THREE.Mesh(geo, mat);
      faceMesh.renderOrder = 0;
      faceMesh.userData.faceIndex = fi;
      this._faceOverlay.add(faceMesh);
    });
    this.mesh.add(this._faceOverlay);
  }

  _removeOverlay() {
    [this._pointCloud, this._edgeLines, this._faceOverlay].forEach(obj => {
      if (obj) {
        obj.parent?.remove(obj);
        obj.traverse(o => {
          o.geometry?.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
            else o.material.dispose();
          }
        });
      }
    });
    this._pointCloud = null;
    this._edgeLines = null;
    this._faceOverlay = null;
  }

  _refreshOverlayColors() {
    if (!this._pointCloud) return;

    // Vertices — white normal, orange selected
    const colors = [];
    this.vertices.forEach((_, i) => {
      if (this.selVerts.has(i)) colors.push(1, 0.6, 0.1);
      else colors.push(0.8, 0.8, 0.8);
    });
    const colAttr = new THREE.BufferAttribute(new Float32Array(colors), 3);
    this._pointCloud.geometry.setAttribute('color', colAttr);
    this._pointCloud.material.vertexColors = true;
    this._pointCloud.material.needsUpdate = true;

    // Edges — orange if both verts selected, blue if selected edge
    const edgeColors = [];
    this.edges.forEach(([a, b], ei) => {
      const sel = this.selEdges.has(ei) || (this.selVerts.has(a) && this.selVerts.has(b));
      const c = sel ? [1, 0.6, 0.1] : [0.53, 0.53, 0.53];
      edgeColors.push(...c, ...c);
    });
    const eColAttr = new THREE.BufferAttribute(new Float32Array(edgeColors), 3);
    this._edgeLines.geometry.setAttribute('color', eColAttr);
    this._edgeLines.material.vertexColors = true;
    this._edgeLines.material.needsUpdate = true;

    // Faces — highlight selected
    if (this._faceOverlay) {
      this._faceOverlay.children.forEach((fm, fi) => {
        const sel = this.selFaces.has(fi);
        fm.material.opacity = sel ? 0.4 : 0;
        fm.material.color.set(sel ? 0xff8c00 : 0x4a9eff);
        fm.material.needsUpdate = true;
      });
    }
  }

  // ── Click handler ──────────────────────────────────────────────────────────

  handleClick(pointer, additive) {
    if (!this.active || !this.mesh) return;

    const raycaster = this.selMgr.castRay(pointer);

    if (this.selectMode === 'vertex') {
      this._selectVertex(raycaster, additive);
    } else if (this.selectMode === 'edge') {
      this._selectEdge(raycaster, additive);
    } else {
      this._selectFace(raycaster, additive);
    }

    this._refreshOverlayColors();
  }

  _selectVertex(raycaster, additive) {
    if (!additive) this.selVerts.clear();
    const hits = raycaster.intersectObject(this._pointCloud);
    if (hits.length > 0) {
      const idx = hits[0].index;
      if (this.selVerts.has(idx)) this.selVerts.delete(idx);
      else this.selVerts.add(idx);
    }
  }

  _selectEdge(raycaster, additive) {
    if (!additive) this.selEdges.clear();
    const hits = raycaster.intersectObject(this._edgeLines);
    if (hits.length > 0) {
      // Find closest edge
      const pt = hits[0].point.clone();
      this.mesh.worldToLocal(pt);
      let best = -1, bestD = Infinity;
      this.edges.forEach(([a, b], i) => {
        const va = this.vertices[a], vb = this.vertices[b];
        const line = new THREE.Line3(va, vb);
        const cl = new THREE.Vector3();
        line.closestPointToPoint(pt, true, cl);
        const d = cl.distanceTo(pt);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== -1) {
        if (this.selEdges.has(best)) this.selEdges.delete(best);
        else this.selEdges.add(best);
      }
    }
  }

  _selectFace(raycaster, additive) {
    if (!additive) this.selFaces.clear();
    const faceMeshes = this._faceOverlay.children;
    // Temporarily make all face meshes visible for raycasting
    faceMeshes.forEach(fm => { fm.material.opacity = 0.01; });
    const hits = raycaster.intersectObjects(faceMeshes, false);
    faceMeshes.forEach(fm => { fm.material.opacity = this.selFaces.has(fm.userData.faceIndex) ? 0.4 : 0; });

    if (hits.length > 0) {
      const fi = hits[0].object.userData.faceIndex;
      if (this.selFaces.has(fi)) this.selFaces.delete(fi);
      else this.selFaces.add(fi);
    }
  }

  // ── Select mode ────────────────────────────────────────────────────────────

  setSelectMode(mode) {
    this.selectMode = mode;
    this.selVerts.clear();
    this.selEdges.clear();
    this.selFaces.clear();
    this._refreshOverlayColors();
  }

  selectAll() {
    if (this.selectMode === 'vertex') this.vertices.forEach((_, i) => this.selVerts.add(i));
    else if (this.selectMode === 'edge') this.edges.forEach((_, i) => this.selEdges.add(i));
    else this.faces.forEach((_, i) => this.selFaces.add(i));
    this._refreshOverlayColors();
  }

  deselectAll() {
    this.selVerts.clear(); this.selEdges.clear(); this.selFaces.clear();
    this._refreshOverlayColors();
  }

  // ── Operations ─────────────────────────────────────────────────────────────

  extrude() {
    if (!this.active) return;
    if (this.selectMode === 'face' && this.selFaces.size > 0) {
      this._extrudeFaces();
    } else if (this.selectMode === 'vertex' && this.selVerts.size > 0) {
      this._extrudeVertices();
    }
    this._rebuildGeometry();
    this._buildOverlay();
    this._refreshOverlayColors();
  }

  _extrudeFaces() {
    const DIST = 0.5;
    this.selFaces.forEach(fi => {
      const [a, b, c] = this.faces[fi];
      const va = this.vertices[a], vb = this.vertices[b], vc = this.vertices[c];
      // Normal
      const edge1 = new THREE.Vector3().subVectors(vb, va);
      const edge2 = new THREE.Vector3().subVectors(vc, va);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize().multiplyScalar(DIST);

      // New vertices
      const na = this.vertices.length; this.vertices.push(va.clone().add(normal));
      const nb = this.vertices.length; this.vertices.push(vb.clone().add(normal));
      const nc = this.vertices.length; this.vertices.push(vc.clone().add(normal));

      // Replace original face with extruded
      this.faces[fi] = [na, nb, nc];

      // Side faces
      this.faces.push([a, b, nb], [a, nb, na]);
      this.faces.push([b, c, nc], [b, nc, nb]);
      this.faces.push([c, a, na], [c, na, nc]);
    });
  }

  _extrudeVertices() {
    const DIST = 0.3;
    this.selVerts.forEach(vi => {
      const v = this.vertices[vi];
      const newIdx = this.vertices.length;
      this.vertices.push(v.clone().add(new THREE.Vector3(0, DIST, 0)));
      this.edges.push([vi, newIdx]);
    });
  }

  deleteSelected() {
    if (!this.active) return;
    if (this.selectMode === 'face') {
      const sorted = Array.from(this.selFaces).sort((a,b) => b - a);
      sorted.forEach(fi => this.faces.splice(fi, 1));
      this.selFaces.clear();
    } else if (this.selectMode === 'vertex') {
      // Remove verts and any faces that reference them
      const toRemove = new Set(this.selVerts);
      this.faces = this.faces.filter(f => !f.some(i => toRemove.has(i)));
      // Re-index
      const oldToNew = new Map();
      let idx = 0;
      this.vertices = this.vertices.filter((_, i) => {
        if (toRemove.has(i)) return false;
        oldToNew.set(i, idx++); return true;
      });
      this.faces = this.faces.map(f => f.map(i => oldToNew.get(i)));
      this.selVerts.clear();
    } else if (this.selectMode === 'edge') {
      // Remove edges and degenerate faces
      const edgesToRemove = new Set(this.selEdges);
      const vertsToRemove = new Set();
      edgesToRemove.forEach(ei => {
        const [a, b] = this.edges[ei];
        vertsToRemove.add(a); vertsToRemove.add(b);
      });
      this.faces = this.faces.filter(f => !f.some(i => vertsToRemove.has(i)));
      this.selEdges.clear();
    }
    this._rebuildGeometry();
    this._buildOverlay();
    this._refreshOverlayColors();
  }

  merge() {
    if (!this.active || this.selectMode !== 'vertex' || this.selVerts.size < 2) return;
    const verts = Array.from(this.selVerts);
    // Merge to center
    const center = new THREE.Vector3();
    verts.forEach(vi => center.add(this.vertices[vi]));
    center.divideScalar(verts.length);

    const firstIdx = verts[0];
    this.vertices[firstIdx].copy(center);

    const replaceMap = new Map();
    verts.slice(1).forEach(vi => replaceMap.set(vi, firstIdx));

    this.faces = this.faces.map(f => {
      const nf = f.map(i => replaceMap.has(i) ? replaceMap.get(i) : i);
      // Remove degenerate
      if (new Set(nf).size < 3) return null;
      return nf;
    }).filter(Boolean);

    this.selVerts.clear();
    this.selVerts.add(firstIdx);
    this._rebuildGeometry();
    this._buildOverlay();
    this._refreshOverlayColors();
  }

  fill() {
    if (!this.active || this.selectMode !== 'vertex' || this.selVerts.size < 3) return;
    const verts = Array.from(this.selVerts);
    // Fan triangulation
    for (let i = 1; i < verts.length - 1; i++) {
      this.faces.push([verts[0], verts[i], verts[i+1]]);
    }
    this._rebuildGeometry();
    this._buildOverlay();
    this._refreshOverlayColors();
  }

  loopCut() {
    // Simple horizontal loop cut on a cylinder-like mesh
    if (!this.active) return;
    // Find all edges roughly horizontal (similar Y on both ends)
    const candidates = [];
    this.edges.forEach(([a, b], ei) => {
      const va = this.vertices[a], vb = this.vertices[b];
      const midY = (va.y + vb.y) / 2;
      if (Math.abs(va.y - vb.y) > 0.01) candidates.push({ ei, a, b, midY });
    });
    if (candidates.length === 0) return;

    // Group by midY level
    const midYSet = new Map();
    candidates.forEach(c => {
      const key = c.midY.toFixed(2);
      if (!midYSet.has(key)) midYSet.set(key, []);
      midYSet.get(key).push(c);
    });

    // Pick first ring and insert midpoint vertices
    const ring = Array.from(midYSet.values())[0];
    ring.forEach(({ a, b }) => {
      const va = this.vertices[a], vb = this.vertices[b];
      const mid = va.clone().lerp(vb, 0.5);
      this.vertices.push(mid);
    });

    this._rebuildGeometry();
    this._buildOverlay();
    this._refreshOverlayColors();
  }

  bevel() {
    if (!this.active || this.selectMode !== 'vertex' || this.selVerts.size === 0) return;
    const FACTOR = 0.2;
    const newVerts = [];

    this.selVerts.forEach(vi => {
      // Find connected vertices
      const connected = new Set();
      this.edges.forEach(([a, b]) => {
        if (a === vi) connected.add(b);
        if (b === vi) connected.add(a);
      });
      const center = this.vertices[vi];
      connected.forEach(ci => {
        const newV = center.clone().lerp(this.vertices[ci], FACTOR);
        newVerts.push({ from: vi, to: ci, newIdx: this.vertices.length });
        this.vertices.push(newV);
      });
    });

    this._rebuildGeometry();
    this._buildOverlay();
    this._refreshOverlayColors();
  }

  // ── Rebuild BufferGeometry from vertices/faces ─────────────────────────────

  _rebuildGeometry() {
    if (!this.mesh) return;
    const positions = new Float32Array(this.vertices.length * 3);
    this.vertices.forEach((v, i) => { positions[i*3]=v.x; positions[i*3+1]=v.y; positions[i*3+2]=v.z; });

    const indices = [];
    this.faces.forEach(([a,b,c]) => { indices.push(a, b, c); });

    const geo = this.mesh.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.attributes.position.needsUpdate = true;
    geo.index.needsUpdate = true;
  }

  // ── Update loop ────────────────────────────────────────────────────────────

  update() {
    // Nothing per-frame needed
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getSelectionStats() {
    if (!this.active) return null;
    const mode = this.selectMode;
    const count = mode === 'vertex' ? this.selVerts.size
      : mode === 'edge' ? this.selEdges.size : this.selFaces.size;
    if (count === 0) return null;
    return { type: { vertex:'vértice', edge:'borde', face:'cara' }[mode], count };
  }

  getMeshStats() {
    if (!this.active || !this.mesh) return { vertices: 0, edges: 0, faces: 0, selected: 0 };
    const sel = this.selectMode === 'vertex' ? this.selVerts.size
      : this.selectMode === 'edge' ? this.selEdges.size : this.selFaces.size;
    return {
      vertices: this.vertices.length,
      edges: this.edges.length,
      faces: this.faces.length,
      selected: sel,
    };
  }
}
