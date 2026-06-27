import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { SceneManager } from './SceneManager.js';
import { EditModeManager } from './EditModeManager.js';
import { PrimitiveFactory } from './PrimitiveFactory.js';
import { SelectionManager } from './SelectionManager.js';
import { KeyboardHandler } from './KeyboardHandler.js';

// ── Renderer ──
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;

// ── Scene ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
camera.position.set(5, 4, 7);
camera.lookAt(0, 0, 0);

// ── Lights ──
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(8, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
fillLight.position.set(-5, 3, -5);
scene.add(fillLight);

// ── Grid & axes ──
const grid = new THREE.GridHelper(20, 20, 0x0f3460, 0x0f3460);
grid.material.opacity = 0.5;
grid.material.transparent = true;
scene.add(grid);

const axes = new THREE.AxesHelper(1.5);
scene.add(axes);

// ── Ground plane (shadow catcher) ──
const groundGeo = new THREE.PlaneGeometry(40, 40);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ── Orbit controls ──
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.maxDistance = 200;

// ── Transform controls ──
const transformCtrl = new TransformControls(camera, renderer.domElement);
transformCtrl.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
scene.add(transformCtrl);

// ── Managers ──
const sceneManager = new SceneManager(scene);
const primFactory = new PrimitiveFactory(scene, sceneManager);
const selectionManager = new SelectionManager(scene, camera, renderer, sceneManager);
const editManager = new EditModeManager(scene, selectionManager, sceneManager);

// ── Expose globals for HTML onclick handlers ──
window.appMode = 'object'; // 'object' | 'edit'
window.currentTool = 'select';
window.navMode = 'orbit';

window.setMode = (mode) => {
  if (mode === 'edit' && !sceneManager.activeObject) return;
  window.appMode = mode;
  document.body.classList.toggle('edit-mode', mode === 'edit');
  document.getElementById('btn-object').classList.toggle('active', mode === 'object');
  document.getElementById('btn-edit').classList.toggle('active', mode === 'edit');

  if (mode === 'edit') {
    editManager.enter(sceneManager.activeObject);
    document.getElementById('hint-box').innerHTML =
      '<b>Modo Edición</b> — Clic para seleccionar elementos · <b>1</b> vértices · <b>2</b> bordes · <b>3</b> caras · <b>Tab</b> para salir';
    document.getElementById('st-mode').textContent = 'MODO EDICIÓN';
  } else {
    editManager.exit();
    document.getElementById('hint-box').innerHTML =
      '<b>Modo Objeto</b> — Clic para seleccionar · Rueda para zoom · Clic+arrastrar para orbitar<br><b>Shift+A</b> para añadir primitiva · <b>Tab</b> para entrar al modo edición';
    document.getElementById('st-mode').textContent = 'MODO OBJETO';
  }
  updateModeLabel();
  updateStatusBar();
};

window.setTool = (tool) => {
  window.currentTool = tool;
  ['select','move','rotate','scale'].forEach(t => {
    document.getElementById('tb-' + t)?.classList.toggle('active', t === tool);
  });
  if (window.appMode === 'object' && sceneManager.activeObject) {
    transformCtrl.attach(sceneManager.activeObject);
    transformCtrl.setMode(tool === 'move' ? 'translate' : tool === 'rotate' ? 'rotate' : tool === 'scale' ? 'scale' : 'translate');
    if (tool === 'select') transformCtrl.detach();
  }
  document.getElementById('st-tool').textContent = 'Herramienta: ' + { select:'Seleccionar', move:'Mover', rotate:'Rotar', scale:'Escalar' }[tool];
};

window.setNavMode = (m) => {
  window.navMode = m;
  controls.enablePan = m === 'pan';
};

window.togglePrimPopup = () => {
  const popup = document.getElementById('primitives-popup');
  popup.classList.toggle('visible');
};

window.addPrimitive = (type) => {
  document.getElementById('primitives-popup').classList.remove('visible');
  const mesh = primFactory.create(type);
  sceneManager.select(mesh);
  if (window.currentTool !== 'select') {
    transformCtrl.attach(mesh);
  }
  updateSceneList();
  updateTransformPanel();
  updateModeLabel();
  updateStatusBar();
};

window.setSelectMode = (mode) => {
  editManager.setSelectMode(mode);
  ['vert','edge','face'].forEach(m => {
    document.getElementById('sel-' + m).classList.toggle('active',
      m === {vertex:'vert', edge:'edge', face:'face'}[mode]);
  });
};

window.applyTransformInput = () => {
  if (!sceneManager.activeObject) return;
  const obj = sceneManager.activeObject;
  obj.position.set(
    parseFloat(document.getElementById('px').value) || 0,
    parseFloat(document.getElementById('py').value) || 0,
    parseFloat(document.getElementById('pz').value) || 0
  );
  obj.rotation.set(
    THREE.MathUtils.degToRad(parseFloat(document.getElementById('rx').value) || 0),
    THREE.MathUtils.degToRad(parseFloat(document.getElementById('ry').value) || 0),
    THREE.MathUtils.degToRad(parseFloat(document.getElementById('rz').value) || 0)
  );
  obj.scale.set(
    parseFloat(document.getElementById('sx').value) || 1,
    parseFloat(document.getElementById('sy').value) || 1,
    parseFloat(document.getElementById('sz').value) || 1
  );
};

window.applyMaterial = () => {
  const target = window.appMode === 'object' ? sceneManager.activeObject : null;
  const mesh = target;
  if (!mesh) return;
  const color = document.getElementById('mat-color').value;
  const rough = parseFloat(document.getElementById('mat-rough').value);
  const metal = parseFloat(document.getElementById('mat-metal').value);
  const opacity = parseFloat(document.getElementById('mat-opacity').value);
  const wire = document.getElementById('mat-wire').checked;
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => {
      m.color?.set(color);
      if (m.roughness !== undefined) { m.roughness = rough; m.metalness = metal; }
      m.opacity = opacity;
      m.transparent = opacity < 1;
      m.wireframe = wire;
    });
  } else if (mesh.material) {
    mesh.material.color?.set(color);
    if (mesh.material.roughness !== undefined) {
      mesh.material.roughness = rough;
      mesh.material.metalness = metal;
    }
    mesh.material.opacity = opacity;
    mesh.material.transparent = opacity < 1;
    mesh.material.wireframe = wire;
    mesh.material.needsUpdate = true;
  }
};

window.enterXR = () => {
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then(supported => {
      if (supported) {
        document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));
      } else {
        navigator.xr.isSessionSupported('immersive-vr').then(vr => {
          if (vr) document.body.appendChild(VRButton.createButton(renderer));
          else alert('Tu dispositivo no soporta WebXR.');
        });
      }
    });
  } else {
    alert('WebXR no disponible en este navegador.');
  }
};

// ── Edit mode operations ──
window.doExtrude = () => editManager.extrude();
window.doLoopCut = () => editManager.loopCut();
window.doBevel = () => editManager.bevel();
window.doDelete = () => {
  if (window.appMode === 'edit') editManager.deleteSelected();
  else {
    if (sceneManager.activeObject) {
      transformCtrl.detach();
      sceneManager.remove(sceneManager.activeObject);
      updateSceneList();
      updateTransformPanel();
      updateModeLabel();
      updateStatusBar();
    }
  }
};
window.doMerge = () => editManager.merge();
window.doFill = () => editManager.fill();

// ── Keyboard ──
const kbd = new KeyboardHandler({ camera, controls, scene, sceneManager, editManager, transformCtrl });

// ── Click to select (object mode) ──
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  _pointerDownPos = { x: e.clientX, y: e.clientY };
});

let _pointerDownPos = null;

renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !_pointerDownPos) return;
  const dx = e.clientX - _pointerDownPos.x;
  const dy = e.clientY - _pointerDownPos.y;
  if (Math.sqrt(dx * dx + dy * dy) > 5) return; // was a drag

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  if (window.appMode === 'edit') {
    editManager.handleClick(pointer, e.shiftKey);
    updateSelInfo();
    updateStatusBar();
  } else {
    raycaster.setFromCamera(pointer, camera);
    const meshes = sceneManager.meshes;
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      sceneManager.select(hits[0].object);
      if (window.currentTool !== 'select') {
        transformCtrl.attach(hits[0].object);
      }
    } else {
      sceneManager.deselect();
      transformCtrl.detach();
    }
    updateTransformPanel();
    updateModeLabel();
    updateStatusBar();
  }
});

// ── Transform controls change → sync panel ──
transformCtrl.addEventListener('change', () => {
  if (sceneManager.activeObject) updateTransformPanel();
});

// ── Resize ──
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ── Panel helpers ──
function updateTransformPanel() {
  const obj = sceneManager.activeObject;
  const panel = document.getElementById('obj-transform');
  if (!obj) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const p = obj.position, r = obj.rotation, s = obj.scale;
  document.getElementById('px').value = p.x.toFixed(3);
  document.getElementById('py').value = p.y.toFixed(3);
  document.getElementById('pz').value = p.z.toFixed(3);
  document.getElementById('rx').value = THREE.MathUtils.radToDeg(r.x).toFixed(1);
  document.getElementById('ry').value = THREE.MathUtils.radToDeg(r.y).toFixed(1);
  document.getElementById('rz').value = THREE.MathUtils.radToDeg(r.z).toFixed(1);
  document.getElementById('sx').value = s.x.toFixed(3);
  document.getElementById('sy').value = s.y.toFixed(3);
  document.getElementById('sz').value = s.z.toFixed(3);
}

function updateModeLabel() {
  const name = sceneManager.activeObject?.userData.name || 'Ninguno';
  document.getElementById('mode-label').textContent =
    (window.appMode === 'object' ? 'Modo Objeto' : 'Modo Edición') +
    ' — ' + (window.appMode === 'object' ? `Seleccionado: ${name}` : `Editando: ${name}`);
}

function updateSceneList() {
  const list = document.getElementById('scene-list');
  if (sceneManager.meshes.length === 0) { list.innerHTML = '(vacía)'; return; }
  list.innerHTML = sceneManager.meshes.map((m, i) =>
    `<div style="padding:3px 6px;border-radius:3px;cursor:pointer;${sceneManager.activeObject === m ? 'background:#0f3460;color:#e94560' : ''}"
     onclick="selectFromList(${i})">${m.userData.name || 'Objeto ' + (i+1)}</div>`
  ).join('');
}
window.selectFromList = (i) => {
  sceneManager.select(sceneManager.meshes[i]);
  if (window.currentTool !== 'select') transformCtrl.attach(sceneManager.meshes[i]);
  updateTransformPanel();
  updateModeLabel();
  updateSceneList();
};

function updateSelInfo() {
  const info = document.getElementById('sel-info');
  const stats = editManager.getSelectionStats();
  if (!stats) { info.textContent = 'Sin selección'; return; }
  info.textContent = `Seleccionados: ${stats.count} ${stats.type}(s)`;
}

function updateStatusBar() {
  const stats = editManager.getMeshStats();
  document.getElementById('st-verts').textContent = `Vért: ${stats.vertices}`;
  document.getElementById('st-edges').textContent = `Bord: ${stats.edges}`;
  document.getElementById('st-faces').textContent = `Car: ${stats.faces}`;
  document.getElementById('st-sel').textContent = `Sel: ${stats.selected}`;
}

// ── Render loop ──
renderer.setAnimationLoop(() => {
  controls.update();
  editManager.update();
  renderer.render(scene, camera);
});

// Initial update
updateStatusBar();
