import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { DeviceDetector } from './DeviceDetector.js';
import { SceneManager } from './SceneManager.js';
import { EditModeManager } from './EditModeManager.js';
import { PrimitiveFactory } from './PrimitiveFactory.js';
import { SelectionManager } from './SelectionManager.js';
import { KeyboardHandler } from './KeyboardHandler.js';
import { TouchControls } from './TouchControls.js';
import { XRManager } from './XRManager.js';
import { XRDiag } from './XRDiag.js';

// ── Detect device first ────────────────────────────────────────────────────────
const deviceInfo = await DeviceDetector.detect();

// Diagnóstico disponible desde el inicio
const xrDiag = new XRDiag();
window.xrDiag = xrDiag;

// ── Build renderer & scene immediately (before launch screen) ────────────────
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, deviceInfo.isQuest ? 1.25 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;
window._renderer = renderer; // expuesto para XRDiag

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
camera.position.set(5, 4, 7);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(8, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(deviceInfo.isQuest ? 1024 : 2048, deviceInfo.isQuest ? 1024 : 2048);
Object.assign(sun.shadow.camera, { near: 0.1, far: 50, left: -15, right: 15, top: 15, bottom: -15 });
scene.add(sun);
const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
fillLight.position.set(-5, 3, -5);
scene.add(fillLight);

const grid = new THREE.GridHelper(20, 20, 0x0f3460, 0x0f3460);
grid.material.opacity = 0.5; grid.material.transparent = true;
scene.add(grid);
scene.add(new THREE.AxesHelper(1.5));
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(40,40), new THREE.ShadowMaterial({ opacity:.25 }));
shadowCatcher.rotation.x = -Math.PI/2; shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.5; controls.maxDistance = 200;

const transformCtrl = new TransformControls(camera, renderer.domElement);
transformCtrl.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
scene.add(transformCtrl);

const sceneManager = new SceneManager(scene);
const primFactory  = new PrimitiveFactory(scene, sceneManager);
const selMgr       = new SelectionManager(scene, camera, renderer, sceneManager);
const editManager  = new EditModeManager(scene, selMgr, sceneManager);

const xrManager = new XRManager({
  renderer, scene, camera, sceneManager, primFactory,
  onEnter: (mode) => {
    controls.enabled = false;
    document.body.classList.add('xr-active');
    if (mode === 'vr') {
      scene.background = new THREE.Color(0x050510);
      scene.fog = null;
    } else {
      scene.background = null;
    }
  },
  onExit: () => {
    controls.enabled = true;
    document.body.classList.remove('xr-active');
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 30, 80);
  },
});

const touchControls = new TouchControls(renderer.domElement, camera, controls);

// ── Render loop starts immediately ────────────────────────────────────────────
renderer.setAnimationLoop((_, frame) => {
  controls.update();
  editManager.update();
  xrManager.update(frame);
  renderer.render(scene, camera);
});

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ── Launch screen ─────────────────────────────────────────────────────────────
// CRITICAL: XR must be requested from the same synchronous click handler.
// We inject the enterVR/enterAR call directly into the button click,
// BEFORE any await/setTimeout, so the browser user-gesture check passes.
showLaunchUI(deviceInfo, {
  onDesktop: () => initEnv('desktop'),
  onMobile:  () => initEnv('mobile'),
  onVR: () => {
    // enterVR called HERE, synchronously from the click — required by browsers
    xrManager.enterVR();
    initEnv('vr');
  },
  onAR: () => {
    xrManager.enterAR();
    initEnv('ar');
  },
});

// ── Environment init ──────────────────────────────────────────────────────────
let currentEnv = 'desktop';

function initEnv(env) {
  currentEnv = env;
  document.body.dataset.env = env;

  if (env === 'mobile') {
    buildMobileToolbar();
    setHint('Toca para seleccionar · Pellizca para zoom · 2 dedos para orbitar');
  } else if (env === 'vr') {
    setHint('🥽 VR activo · <b>Gatillo</b>: seleccionar · <b>Squeeze izq.</b>: añadir cubo · <b>Squeeze der.</b>: eliminar');
    buildXRButtons();
  } else if (env === 'ar') {
    setHint('📷 AR activo · Toca una superficie para colocar objetos');
    buildXRButtons();
  } else {
    setHint('<b>Modo Objeto</b> · <b>Shift+A</b> añadir · <b>Tab</b> modo edición · Arrastrar para orbitar');
    new KeyboardHandler({ camera, controls, scene, sceneManager, editManager, transformCtrl });
  }

  // "Cambiar entorno" button in topbar
  const changeBtn = document.createElement('button');
  changeBtn.className = 'mode-btn';
  changeBtn.style.marginLeft = '8px';
  changeBtn.innerHTML = '⚙ Entorno';
  changeBtn.title = 'Cambiar entorno de trabajo';
  changeBtn.onclick = () => {
    showLaunchUI(deviceInfo, {
      onDesktop: () => { location.reload(); },
      onMobile:  () => { location.reload(); },
      onVR: () => { xrManager.enterVR(); },
      onAR: () => { xrManager.enterAR(); },
    });
  };
  document.getElementById('topbar').appendChild(changeBtn);

  // Always-visible VR button (bottom-right), works on Quest without launch screen
  buildFloatingVRButton();

  // LOG button in topbar
  const logBtn = document.createElement('button');
  logBtn.className = 'mode-btn';
  logBtn.innerHTML = '🔍 LOG';
  logBtn.title = 'Diagnóstico XR — ver qué está fallando';
  logBtn.style.cssText = 'margin-left:8px;border-color:#ffd43b;color:#ffd43b;';
  logBtn.onclick = () => { xrDiag.show(); xrDiag.run(); };
  document.getElementById('topbar').appendChild(logBtn);

  updateStatusBar();
}

function buildFloatingVRButton() {
  if (document.getElementById('floating-vr-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'floating-vr-btn';
  btn.innerHTML = '🥽 VR';
  btn.title = 'Entrar en VR (Meta Quest)';
  btn.onclick = () => xrManager.enterVR(); // direct call = gesture safe

  const style = document.createElement('style');
  style.textContent = `
    #floating-vr-btn {
      position: fixed;
      bottom: 36px; right: 230px;
      padding: 10px 20px;
      background: #e94560;
      border: none; border-radius: 8px;
      color: #fff; font-size: 15px; font-weight: 600;
      cursor: pointer; z-index: 500;
      box-shadow: 0 4px 20px rgba(233,69,96,.45);
      transition: background .15s, transform .1s;
    }
    #floating-vr-btn:hover { background: #c73652; transform: translateY(-1px); }
    #floating-vr-btn:active { transform: scale(.97); }
    @media (max-width: 600px) { #floating-vr-btn { right: 10px; bottom: 90px; } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(btn);

  // Show XR diagnostic in console + status bar
  _logXRDiag();
}

function _logXRDiag() {
  if (!navigator.xr) {
    console.warn('[XR] navigator.xr no disponible');
    return;
  }
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    console.log('[XR] immersive-vr supported:', ok);
    const btn = document.getElementById('floating-vr-btn');
    if (btn) {
      btn.title = ok
        ? 'VR listo ✓ — Haz clic para entrar'
        : 'VR: no detectado (¿HTTPS? ¿Meta Quest Browser?)';
      if (!ok) btn.style.background = '#555';
    }
  });
  navigator.xr.isSessionSupported('immersive-ar').then(ok => {
    console.log('[XR] immersive-ar supported:', ok);
  });
}

// ── Globals for HTML onclick handlers ─────────────────────────────────────────
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
    setHint('<b>Modo Objeto</b> · <b>Shift+A</b> añadir · <b>Tab</b> modo edición');
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
      transformCtrl.setMode(tool==='move'?'translate':tool==='rotate'?'rotate':'scale');
    }
  }
};

window.setNavMode = (m) => { controls.enablePan = m === 'pan'; };
window.togglePrimPopup = () =>
  document.getElementById('primitives-popup')?.classList.toggle('visible');

window.addPrimitive = (type) => {
  document.getElementById('primitives-popup')?.classList.remove('visible');
  const mesh = primFactory.create(type);
  sceneManager.select(mesh);
  if (window.currentTool !== 'select') transformCtrl.attach(mesh);
  updateSceneList(); updateTransformPanel(); updateModeLabel(); updateStatusBar();
};

window.setSelectMode = (mode) => {
  editManager.setSelectMode(mode);
  ['vert','edge','face'].forEach(m =>
    document.getElementById('sel-' + m)?.classList.toggle('active',
      m === {vertex:'vert',edge:'edge',face:'face'}[mode])
  );
};

window.applyTransformInput = () => {
  const obj = sceneManager.activeObject; if (!obj) return;
  obj.position.set(+v('px')||0, +v('py')||0, +v('pz')||0);
  obj.rotation.set(
    THREE.MathUtils.degToRad(+v('rx')||0),
    THREE.MathUtils.degToRad(+v('ry')||0),
    THREE.MathUtils.degToRad(+v('rz')||0)
  );
  obj.scale.set(+v('sx')||1, +v('sy')||1, +v('sz')||1);
};
function v(id) { return document.getElementById(id)?.value; }

window.applyMaterial = () => {
  const mesh = sceneManager.activeObject; if (!mesh?.material) return;
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

// VR/AR — always call manager directly (gesture-safe)
window.enterXR = () => xrManager.enterVR();
window.enterVR = () => xrManager.enterVR();
window.enterAR = () => xrManager.enterAR();

window.doExtrude = () => editManager.extrude();
window.doLoopCut = () => editManager.loopCut();
window.doBevel   = () => editManager.bevel();
window.doMerge   = () => editManager.merge();
window.doFill    = () => editManager.fill();
window.doDelete  = () => {
  if (window.appMode === 'edit') { editManager.deleteSelected(); }
  else if (sceneManager.activeObject) {
    transformCtrl.detach(); sceneManager.remove(sceneManager.activeObject);
    updateSceneList(); updateTransformPanel(); updateModeLabel(); updateStatusBar();
  }
};

// ── Click / Tap selection ─────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
let _ptrDown = null;

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  _ptrDown = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', e => {
  if (e.button !== 0 || !_ptrDown || e.pointerType === 'touch') return;
  if (Math.hypot(e.clientX - _ptrDown.x, e.clientY - _ptrDown.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  handlePick(new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  ), e.shiftKey);
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
      sceneManager.deselect(); transformCtrl.detach();
    }
    updateTransformPanel(); updateModeLabel(); updateSceneList(); updateStatusBar();
  }
}

transformCtrl.addEventListener('change', () => { if (sceneManager.activeObject) updateTransformPanel(); });

// ── Mobile floating toolbar ───────────────────────────────────────────────────
function buildMobileToolbar() {
  if (document.getElementById('mobile-toolbar')) return;
  const bar = document.createElement('div');
  bar.id = 'mobile-toolbar';
  bar.innerHTML = `
    <button onclick="togglePrimPopup()">＋</button>
    <button onclick="setMode(appMode==='object'?'edit':'object')">⬡</button>
    <button onclick="setTool('move')">✥</button>
    <button onclick="setTool('rotate')">↻</button>
    <button onclick="setTool('scale')">⤡</button>
    <button onclick="doDelete()">✕</button>
    <button onclick="enterXR()">🥽</button>
  `;
  document.body.appendChild(bar);

  const style = document.createElement('style');
  style.textContent = `
    #mobile-toolbar{
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
      display:flex;gap:8px;z-index:200;
      background:rgba(22,33,62,.92);border:1px solid #0f3460;
      border-radius:40px;padding:8px 14px;
    }
    #mobile-toolbar button{
      width:46px;height:46px;border-radius:50%;
      border:1px solid #0f3460;background:#0f1e3d;
      color:#ccc;font-size:19px;cursor:pointer;
    }
    #mobile-toolbar button:active{background:#e94560;}
    #toolbar{display:none!important;}
  `;
  document.head.appendChild(style);
}

// ── XR quick-access buttons (replaces the panel button) ──────────────────────
function buildXRButtons() {
  const panel = document.querySelector('#rightpanel .panel-section:last-child');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-title">WebXR</div>
    <button id="xr-vr-btn" onclick="enterVR()" style="width:100%;padding:10px;background:#e94560;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:6px;">
      🥽 Entrar / Salir VR
    </button>
    <button id="xr-ar-btn" onclick="enterAR()" style="width:100%;padding:10px;background:#0f3460;border:1px solid #e94560;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;">
      📷 Entrar / Salir AR
    </button>
    <div class="info-text" style="margin-top:8px;">
      En Meta Quest: abre desde <b>Meta Quest Browser</b>.<br>
      Acepta el diálogo de permisos XR.
    </div>
  `;
}

// ── Panel helpers ─────────────────────────────────────────────────────────────
function setHint(html) {
  const el = document.getElementById('hint-box');
  if (el) el.innerHTML = html;
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
  list.innerHTML = sceneManager.meshes.length === 0 ? '(vacía)' :
    sceneManager.meshes.map((m, i) =>
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

window.updateSelInfo    = updateSelInfo;
window.updateStatusBar  = updateStatusBar;
window.sceneManager     = sceneManager;

// ── Launch UI (inline, no await, calls XR directly from click) ───────────────
function showLaunchUI(info, { onDesktop, onMobile, onVR, onAR }) {
  const recommended = _recommend(info);
  _injectLaunchStyles();

  const overlay = document.createElement('div');
  overlay.id = 'launch-overlay';
  overlay.innerHTML = `
    <div class="launch-bg"></div>
    <div class="launch-card">
      <div class="launch-logo">MR<span>3D</span></div>
      <div class="launch-subtitle">WebMR · Modelado 3D</div>
      <div class="launch-device-info">${_deviceBadges(info)}</div>
      <div class="launch-title">Selecciona tu entorno de trabajo</div>
      <div class="launch-grid">
        <button class="env-btn ${recommended==='desktop'?'recommended':''}" id="lb-desktop">
          <span class="env-icon">🖥️</span>
          <span class="env-name">PC / Escritorio</span>
          <span class="env-desc">Teclado, ratón, pantalla completa</span>
          ${recommended==='desktop'?'<span class="env-badge">Recomendado</span>':''}
        </button>
        <button class="env-btn ${recommended==='mobile'?'recommended':''}" id="lb-mobile">
          <span class="env-icon">📱</span>
          <span class="env-name">Móvil / Tablet</span>
          <span class="env-desc">Controles táctiles, pinch-zoom</span>
          ${recommended==='mobile'?'<span class="env-badge">Recomendado</span>':''}
        </button>
        <button class="env-btn ${recommended==='vr'?'recommended':''} ${!info.supportsVR?'grayed':''}" id="lb-vr">
          <span class="env-icon">🥽</span>
          <span class="env-name">VR · Meta Quest</span>
          <span class="env-desc">Inmersivo con controllers</span>
          ${recommended==='vr'?'<span class="env-badge">Recomendado</span>':''}
          ${!info.supportsVR?'<span class="env-badge gray">Sin WebXR VR</span>':''}
        </button>
        <button class="env-btn ${recommended==='ar'?'recommended':''} ${!info.supportsAR?'grayed':''}" id="lb-ar">
          <span class="env-icon">📷</span>
          <span class="env-name">AR · Realidad Aumentada</span>
          <span class="env-desc">Modela sobre el mundo real</span>
          ${recommended==='ar'?'<span class="env-badge">Recomendado</span>':''}
          ${!info.supportsAR?'<span class="env-badge gray">Sin WebXR AR</span>':''}
        </button>
      </div>
      <div class="launch-auto">
        <button id="lb-auto">▶ Entrar · <strong>${_envLabel(recommended)}</strong></button>
      </div>
      <div class="launch-note">
        Para VR/AR: la solicitud de sesión ocurre en el mismo clic · Acepta el diálogo del navegador
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function dismiss() {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .3s';
    setTimeout(() => overlay.remove(), 320);
  }

  // Each button fires its callback synchronously from the click event.
  // This preserves the user-gesture context required by WebXR.
  document.getElementById('lb-desktop').onclick = () => { dismiss(); onDesktop(); };
  document.getElementById('lb-mobile').onclick  = () => { dismiss(); onMobile(); };
  document.getElementById('lb-vr').onclick      = () => { dismiss(); onVR(); };   // enterVR() called here
  document.getElementById('lb-ar').onclick      = () => { dismiss(); onAR(); };   // enterAR() called here

  const autoActions = { desktop: onDesktop, mobile: onMobile, vr: onVR, ar: onAR };
  document.getElementById('lb-auto').onclick = () => { dismiss(); autoActions[recommended](); };
}

function _recommend(info) {
  if (info.isQuest || info.supportsVR) return 'vr';
  if (info.supportsAR && info.isMobile) return 'ar';
  if (info.isMobile || info.isTablet) return 'mobile';
  return 'desktop';
}
function _envLabel(env) {
  return { desktop:'PC / Escritorio', mobile:'Móvil / Tablet', vr:'VR · Meta Quest', ar:'AR' }[env]||env;
}
function _deviceBadges(info) {
  const b = [];
  if (info.isQuest) b.push('🥽 Meta Quest');
  else if (info.isTablet) b.push('📱 Tablet');
  else if (info.isMobile) b.push('📱 Móvil');
  else b.push('🖥️ PC');
  if (info.supportsVR) b.push('WebXR VR ✓');
  if (info.supportsAR) b.push('WebXR AR ✓');
  return b.map(t => `<span class="dev-badge">${t}</span>`).join('');
}
function _injectLaunchStyles() {
  if (document.getElementById('launch-styles')) return;
  const s = document.createElement('style');
  s.id = 'launch-styles';
  s.textContent = `
    #launch-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;}
    .launch-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#0f3460,#050510 70%);}
    .launch-card{position:relative;background:rgba(16,22,48,.95);border:1px solid #1a3a6a;border-radius:18px;padding:36px 32px 24px;max-width:680px;width:94%;box-shadow:0 8px 60px rgba(0,0,0,.8);}
    .launch-logo{font-size:44px;font-weight:900;letter-spacing:3px;color:#fff;text-align:center;}
    .launch-logo span{color:#e94560;}
    .launch-subtitle{text-align:center;color:#445;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:4px 0 18px;}
    .launch-device-info{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:18px;}
    .dev-badge{background:#0f2244;border:1px solid #1a3a6a;border-radius:20px;padding:4px 12px;font-size:11px;color:#8ab;}
    .launch-title{text-align:center;font-size:12px;color:#556;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px;}
    .launch-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    @media(max-width:500px){.launch-grid{grid-template-columns:1fr;}.launch-card{padding:22px 14px 18px;}}
    .env-btn{background:#070f24;border:1px solid #1a3a6a;border-radius:12px;padding:16px 14px 12px;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;transition:all .18s;position:relative;color:#bcd;}
    .env-btn:hover{border-color:#e94560;background:#120820;transform:translateY(-2px);box-shadow:0 6px 24px rgba(233,69,96,.2);}
    .env-btn:active{transform:scale(.97);}
    .env-btn.recommended{border-color:#e94560;box-shadow:0 0 0 1px #e94560 inset;}
    .env-btn.grayed{opacity:.45;}
    .env-icon{font-size:28px;margin-bottom:4px;}
    .env-name{font-size:13px;font-weight:700;color:#e0e8ff;}
    .env-desc{font-size:10px;color:#556;}
    .env-badge{position:absolute;top:8px;right:8px;background:#e94560;color:#fff;font-size:9px;padding:2px 8px;border-radius:20px;text-transform:uppercase;}
    .env-badge.gray{background:#223;color:#668;}
    .launch-auto{margin-top:16px;text-align:center;}
    #lb-auto{background:#e94560;border:none;color:#fff;padding:13px 36px;border-radius:10px;font-size:15px;cursor:pointer;}
    #lb-auto:hover{background:#c73652;}
    .launch-note{margin-top:10px;text-align:center;font-size:10px;color:#334;}
  `;
  document.head.appendChild(s);
}
