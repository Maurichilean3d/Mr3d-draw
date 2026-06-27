import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { DeviceDetector } from './DeviceDetector.js';
import { showLaunchScreen } from './LaunchScreen.js';
import { SceneManager } from './SceneManager.js';
import { EditModeManager } from './EditModeManager.js';
import { PrimitiveFactory } from './PrimitiveFactory.js';
import { SelectionManager } from './SelectionManager.js';
import { KeyboardHandler } from './KeyboardHandler.js';
import { TouchControls } from './TouchControls.js';
import { XRManager } from './XRManager.js';

// ── Detect device ─────────────────────────────────────────────────────────────
const deviceInfo = await DeviceDetector.detect();
const env = await showLaunchScreen(deviceInfo);

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: env === 'ar' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
if (env !== 'ar') {
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);
}

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
camera.position.set(5, 4, 7);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(8, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 0.1, far: 50, left: -15, right: 15, top: 15, bottom: -15 });
scene.add(sun);
scene.add(Object.assign(new THREE.DirectionalLight(0x4488ff, 0.3), { position: new THREE.Vector3(-5, 3, -5) }));

// ── Grid / Axes (desktop & mobile only) ──────────────────────────────────────
if (env !== 'vr' && env !== 'ar') {
  const grid = new THREE.GridHelper(20, 20, 0x0f3460, 0x0f3460);
  grid.material.opacity = 0.5;
  grid.material.transparent = true;
  scene.add(grid);
  scene.add(new THREE.AxesHelper(1.5));

  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.25 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);
}

// ── Orbit controls ────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.maxDistance = 200;

// ── Transform controls ────────────────────────────────────────────────────────
const transformCtrl = new TransformControls(camera, renderer.domElement);
transformCtrl.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
scene.add(transformCtrl);

// ── Managers ──────────────────────────────────────────────────────────────────
const sceneManager = new SceneManager(scene);
const primFactory = new PrimitiveFactory(scene, sceneManager);
const selectionManager = new SelectionManager(scene, camera, renderer, sceneManager);
const editManager = new EditModeManager(scene, selectionManager, sceneManager);

// ── XR Manager ────────────────────────────────────────────────────────────────
const xrManager = new XRManager({
  renderer, scene, camera, sceneManager, primFactory,
  onEnter: (mode) => {
    controls.enabled = false;
    document.body.classList.add('xr-active');
    document.getElementById('topbar').style.display = mode === 'ar' ? 'flex' : 'none';
  },
  onExit: () => {
    controls.enabled = true;
    document.body.classList.remove('xr-active');
    document.getElementById('topbar').style.display = 'flex';
  },
});

// ── Touch controls (mobile/tablet) ───────────────────────────────────────────
const touchControls = new TouchControls(renderer.domElement, camera, controls);

// ── Apply environment-specific UI ─────────────────────────────────────────────
applyEnvironment(env);

// ── Globals for HTML onclick ──────────────────────────────────────────────────
window.appMode = 'object';
window.currentTool = 'select';

window.setMode = (mode) => {
  if (mode === 'edit' && !sceneManager.activeObject) return;
  window.appMode = mode;
  document.body.classList.toggle('edit-mode', mode === 'edit');
  document.getElementById('btn-object')?.classList.toggle('active', mode === 'object');
  document.getElementById('btn-edit')?.classList.toggle('active', mode === 'edit');
  if (mode === 'edit') {
    editManager.enter(sceneManager.activeObject);
    setHint('<b>Modo Edición</b> · <b>1</b> vértices · <b>2</b> bordes · <b>3</b> caras · <b>Tab</b> para salir');
    document.getElementById('st-mode').textContent = 'MODO EDICIÓN';
  } else {
    editManager.exit();
    setHint('<b>Modo Objeto</b> · <b>Shift+A</b> añadir · <b>Tab</b> modo edición · Arrastrar para orbitar');
    document.getElementById('st-mode').textContent = 'MODO OBJETO';
  }
  updateModeLabel(); updateStatusBar();
};

window.setTool = (tool) => {
  window.currentTool = tool;
  ['select','move','rotate','scale'].forEach(t =>
    document.getElementById('tb-' + t)?.classList.toggle('active', t === tool)
  );
  if (window.appMode === 'object' && sceneManager.activeObject) {
    if (tool === 'select') transformCtrl.detach();
    else {
      transformCtrl.attach(sceneManager.activeObject);
      transformCtrl.setMode(tool === 'move' ? 'translate' : tool === 'rotate' ? 'rotate' : 'scale');
    }
  }
  document.getElementById('st-tool').textContent =
    'Herramienta: ' + { select:'Seleccionar', move:'Mover', rotate:'Rotar', scale:'Escalar' }[tool];
};

window.setNavMode = (m) => { controls.enablePan = m === 'pan'; };

window.togglePrimPopup = () =>
  document.getElementById('primitives-popup').classList.toggle('visible');

window.addPrimitive = (type) => {
  document.getElementById('primitives-popup')?.classList.remove('visible');
  const mesh = primFactory.create(type);
  sceneManager.select(mesh);
  if (window.currentTool !== 'select') transformCtrl.attach(mesh);
  updateSceneList(); updateTransformPanel(); updateModeLabel(); updateStatusBar();
};

window.setSelectMode = (mode) => {
  editManager.setSelectMode(mode);
  ['vert','edge','face'].forEach(m => {
    document.getElementById('sel-' + m)?.classList.toggle('active',
      m === {vertex:'vert', edge:'edge', face:'face'}[mode]);
  });
};

window.applyTransformInput = () => {
  const obj = sceneManager.activeObject;
  if (!obj) return;
  obj.position.set(+document.getElementById('px').value||0, +document.getElementById('py').value||0, +document.getElementById('pz').value||0);
  obj.rotation.set(
    THREE.MathUtils.degToRad(+document.getElementById('rx').value||0),
    THREE.MathUtils.degToRad(+document.getElementById('ry').value||0),
    THREE.MathUtils.degToRad(+document.getElementById('rz').value||0)
  );
  obj.scale.set(+document.getElementById('sx').value||1, +document.getElementById('sy').value||1, +document.getElementById('sz').value||1);
};

window.applyMaterial = () => {
  const mesh = sceneManager.activeObject;
  if (!mesh || !mesh.material) return;
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  m.color?.set(document.getElementById('mat-color').value);
  if (m.roughness !== undefined) {
    m.roughness = +document.getElementById('mat-rough').value;
    m.metalness = +document.getElementById('mat-metal').value;
  }
  m.opacity = +document.getElementById('mat-opacity').value;
  m.transparent = m.opacity < 1;
  m.wireframe = document.getElementById('mat-wire').checked;
  m.needsUpdate = true;
};

window.enterXR = async () => {
  if (env === 'vr' || deviceInfo.supportsVR) await xrManager.enterVR();
  else if (env === 'ar' || deviceInfo.supportsAR) await xrManager.enterAR();
  else alert('Tu dispositivo no soporta WebXR.');
};

window.doExtrude  = () => editManager.extrude();
window.doLoopCut  = () => editManager.loopCut();
window.doBevel    = () => editManager.bevel();
window.doMerge    = () => editManager.merge();
window.doFill     = () => editManager.fill();
window.doDelete   = () => {
  if (window.appMode === 'edit') { editManager.deleteSelected(); }
  else if (sceneManager.activeObject) {
    transformCtrl.detach();
    sceneManager.remove(sceneManager.activeObject);
    updateSceneList(); updateTransformPanel(); updateModeLabel(); updateStatusBar();
  }
};

// ── Click / Tap selection ─────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
let _pointerDownPos = null;

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  _pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', e => {
  if (e.button !== 0 || !_pointerDownPos || e.pointerType === 'touch') return;
  const dx = e.clientX - _pointerDownPos.x, dy = e.clientY - _pointerDownPos.y;
  if (Math.hypot(dx, dy) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ptr = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  handlePick(ptr, e.shiftKey);
});

touchControls.onTap((ptr, shift) => handlePick(ptr, shift));

function handlePick(ptr, shift) {
  if (window.appMode === 'edit') {
    editManager.handleClick(ptr, shift);
    updateSelInfo(); updateStatusBar();
  } else {
    raycaster.setFromCamera(ptr, camera);
    const hits = raycaster.intersectObjects(sceneManager.meshes, false);
    if (hits.length > 0) {
      sceneManager.select(hits[0].object);
      if (window.currentTool !== 'select') transformCtrl.attach(hits[0].object);
    } else {
      sceneManager.deselect();
      transformCtrl.detach();
    }
    updateTransformPanel(); updateModeLabel(); updateSceneList(); updateStatusBar();
  }
}

transformCtrl.addEventListener('change', () => { if (sceneManager.activeObject) updateTransformPanel(); });

// ── Keyboard (desktop only) ───────────────────────────────────────────────────
if (env === 'desktop') {
  new KeyboardHandler({ camera, controls, scene, sceneManager, editManager, transformCtrl });
}

// ── Mobile toolbar (floating action buttons) ─────────────────────────────────
function buildMobileToolbar() {
  const bar = document.createElement('div');
  bar.id = 'mobile-toolbar';
  bar.innerHTML = `
    <button onclick="togglePrimPopup()" title="Añadir">＋</button>
    <button onclick="setMode(appMode==='object'?'edit':'object')" title="Tab">⬡</button>
    <button onclick="setTool('move')" title="Mover">✥</button>
    <button onclick="setTool('rotate')" title="Rotar">↻</button>
    <button onclick="setTool('scale')" title="Escalar">⤡</button>
    <button onclick="doDelete()" title="Eliminar">✕</button>
  `;
  document.body.appendChild(bar);

  const style = document.createElement('style');
  style.textContent = `
    #mobile-toolbar {
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 8px; z-index: 200;
      background: rgba(22,33,62,.9);
      border: 1px solid #0f3460; border-radius: 40px;
      padding: 8px 14px;
    }
    #mobile-toolbar button {
      width: 44px; height: 44px; border-radius: 50%;
      border: 1px solid #0f3460; background: #0f1e3d;
      color: #ccc; font-size: 18px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    #mobile-toolbar button:active { background: #e94560; }
    /* On mobile: hide left toolbar */
    #toolbar { display: none !important; }
    #rightpanel { width: 170px; }
  `;
  document.head.appendChild(style);
}

// ── VR / AR specific UI ───────────────────────────────────────────────────────
function buildXRUI(mode) {
  const el = document.createElement('div');
  el.id = 'ar-overlay';
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;';

  const btn = document.createElement('button');
  btn.id = 'xr-vr-btn';
  btn.textContent = mode === 'ar' ? '📷 Iniciar AR' : '🥽 Iniciar VR';
  btn.style.cssText = `
    position:absolute;bottom:50px;left:50%;transform:translateX(-50%);
    padding:14px 32px;background:#e94560;border:none;color:#fff;
    border-radius:10px;font-size:16px;cursor:pointer;pointer-events:all;
    box-shadow:0 4px 20px rgba(233,69,96,.4);
  `;
  btn.onclick = () => mode === 'ar' ? xrManager.enterAR() : xrManager.enterVR();
  el.appendChild(btn);

  // Add-primitive button for AR
  if (mode === 'ar') {
    const addBtn = document.createElement('button');
    addBtn.textContent = '＋ Cubo';
    addBtn.style.cssText = `
      position:absolute;bottom:50px;right:20px;
      padding:12px 20px;background:#0f3460;border:1px solid #e94560;
      color:#fff;border-radius:8px;font-size:14px;cursor:pointer;pointer-events:all;
    `;
    addBtn.onclick = () => window.addPrimitive('cube');
    el.appendChild(addBtn);
  }

  document.body.appendChild(el);
}

// ── Apply environment ─────────────────────────────────────────────────────────
function applyEnvironment(env) {
  document.body.dataset.env = env;

  if (env === 'mobile') {
    buildMobileToolbar();
    // Disable keyboard-heavy hints
    setHint('Toca para seleccionar · Pellizca para zoom · 2 dedos para orbitar');
  } else if (env === 'vr') {
    buildXRUI('vr');
    setHint('🥽 Modo VR · Pulsa <b>Iniciar VR</b> para entrar');
    // Auto enter VR
    setTimeout(() => xrManager.enterVR(), 800);
  } else if (env === 'ar') {
    buildXRUI('ar');
    setHint('📷 Modo AR · Pulsa <b>Iniciar AR</b> y apunta a una superficie plana');
    setTimeout(() => xrManager.enterAR(), 800);
  } else {
    setHint('<b>Modo Objeto</b> · <b>Shift+A</b> añadir primitiva · <b>Tab</b> modo edición · Arrastrar para orbitar');
  }

  // Add "cambiar entorno" button to topbar
  const changeBtn = document.createElement('button');
  changeBtn.textContent = '⚙ Entorno';
  changeBtn.className = 'mode-btn';
  changeBtn.style.marginLeft = '8px';
  changeBtn.title = 'Cambiar entorno de trabajo';
  changeBtn.onclick = async () => {
    const newEnv = await showLaunchScreen(deviceInfo);
    if (newEnv !== env) location.reload();
  };
  document.getElementById('topbar').appendChild(changeBtn);
}

// ── Resize ────────────────────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ── Panel helpers ─────────────────────────────────────────────────────────────
function setHint(html) {
  const box = document.getElementById('hint-box');
  if (box) box.innerHTML = html;
}

function updateTransformPanel() {
  const obj = sceneManager.activeObject;
  const panel = document.getElementById('obj-transform');
  if (!panel) return;
  if (!obj) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const { position: p, rotation: r, scale: s } = obj;
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
  const el = document.getElementById('mode-label');
  if (el) el.textContent =
    (window.appMode === 'object' ? 'Modo Objeto' : 'Modo Edición') +
    ' — ' + (window.appMode === 'object' ? `Seleccionado: ${name}` : `Editando: ${name}`);
}

function updateSceneList() {
  const list = document.getElementById('scene-list');
  if (!list) return;
  if (sceneManager.meshes.length === 0) { list.innerHTML = '(vacía)'; return; }
  list.innerHTML = sceneManager.meshes.map((m, i) =>
    `<div style="padding:3px 6px;border-radius:3px;cursor:pointer;${sceneManager.activeObject===m?'background:#0f3460;color:#e94560':''}"
     onclick="selectFromList(${i})">${m.userData.name||'Obj '+(i+1)}</div>`
  ).join('');
}
window.selectFromList = (i) => {
  sceneManager.select(sceneManager.meshes[i]);
  if (window.currentTool !== 'select') transformCtrl.attach(sceneManager.meshes[i]);
  updateTransformPanel(); updateModeLabel(); updateSceneList();
};

function updateSelInfo() {
  const el = document.getElementById('sel-info');
  if (!el) return;
  const s = editManager.getSelectionStats();
  el.textContent = s ? `Seleccionados: ${s.count} ${s.type}(s)` : 'Sin selección';
}

function updateStatusBar() {
  const s = editManager.getMeshStats();
  document.getElementById('st-verts').textContent = `Vért: ${s.vertices}`;
  document.getElementById('st-edges').textContent = `Bord: ${s.edges}`;
  document.getElementById('st-faces').textContent = `Car: ${s.faces}`;
  document.getElementById('st-sel').textContent   = `Sel: ${s.selected}`;
}

// Expose for keyboard handler
window.updateSelInfo = updateSelInfo;
window.updateStatusBar = updateStatusBar;

// ── Render loop ───────────────────────────────────────────────────────────────
renderer.setAnimationLoop((_, frame) => {
  controls.update();
  editManager.update();
  xrManager.update(frame);
  renderer.render(scene, camera);
});

updateStatusBar();
