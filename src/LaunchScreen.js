/**
 * Launch / environment picker.
 *
 * Returns a Promise<{env, xrSessionPromise?}>.
 *
 * For VR/AR: the XR session must start from the click event directly.
 * We return an `xrSessionRequested` flag and the caller must attach
 * the actual enterVR/enterAR call to the button click — NOT inside
 * an async chain or setTimeout.
 */
export function showLaunchScreen(deviceInfo) {
  return new Promise(resolve => {
    const recommended = _recommend(deviceInfo);

    _injectStyles();

    const overlay = document.createElement('div');
    overlay.id = 'launch-overlay';
    overlay.innerHTML = `
      <div class="launch-bg"></div>
      <div class="launch-card">
        <div class="launch-logo">MR<span>3D</span></div>
        <div class="launch-subtitle">WebMR · Modelado 3D</div>

        <div class="launch-device-info">${_deviceBadges(deviceInfo)}</div>

        <div class="launch-title">Selecciona tu entorno de trabajo</div>

        <div class="launch-grid">
          <button class="env-btn ${recommended==='desktop'?'recommended':''}" data-env="desktop">
            <span class="env-icon">🖥️</span>
            <span class="env-name">PC / Escritorio</span>
            <span class="env-desc">Teclado, ratón, pantalla completa</span>
            ${recommended==='desktop'?'<span class="env-badge">Recomendado</span>':''}
          </button>

          <button class="env-btn ${recommended==='mobile'?'recommended':''}" data-env="mobile">
            <span class="env-icon">📱</span>
            <span class="env-name">Móvil / Tablet</span>
            <span class="env-desc">Controles táctiles, pinch-zoom</span>
            ${recommended==='mobile'?'<span class="env-badge">Recomendado</span>':''}
          </button>

          <button class="env-btn ${recommended==='vr'?'recommended':''} ${!deviceInfo.supportsVR?'grayed':''}"
                  data-env="vr" id="launch-vr-btn">
            <span class="env-icon">🥽</span>
            <span class="env-name">VR · Meta Quest</span>
            <span class="env-desc">Inmersivo con controllers</span>
            ${recommended==='vr'?'<span class="env-badge">Recomendado</span>':''}
            ${!deviceInfo.supportsVR?'<span class="env-badge gray">Detectando…</span>':''}
          </button>

          <button class="env-btn ${recommended==='ar'?'recommended':''} ${!deviceInfo.supportsAR?'grayed':''}"
                  data-env="ar" id="launch-ar-btn">
            <span class="env-icon">📷</span>
            <span class="env-name">AR · Realidad Aumentada</span>
            <span class="env-desc">Modela sobre el mundo real</span>
            ${recommended==='ar'?'<span class="env-badge">Recomendado</span>':''}
            ${!deviceInfo.supportsAR?'<span class="env-badge gray">No detectado</span>':''}
          </button>
        </div>

        <div class="launch-auto">
          <button id="launch-auto-btn">
            ▶ Entrar · <strong>${_envLabel(recommended)}</strong>
          </button>
        </div>

        <div class="launch-note">
          VR/AR se inicia al hacer clic. Si aparece un cuadro de diálogo del navegador, acéptalo.
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    function pick(env) {
      _dismiss(overlay);
      resolve(env);
    }

    // Each button click resolves with the env — THIS is the user gesture.
    // The caller must use this synchronously to call enterVR/enterAR.
    overlay.querySelectorAll('.env-btn').forEach(btn => {
      btn.addEventListener('click', () => pick(btn.dataset.env));
    });

    document.getElementById('launch-auto-btn').addEventListener('click', () => pick(recommended));
  });
}

function _recommend(info) {
  if (info.isQuest || info.supportsVR) return 'vr';
  if (info.supportsAR && info.isMobile) return 'ar';
  if (info.isMobile || info.isTablet) return 'mobile';
  return 'desktop';
}

function _envLabel(env) {
  return { desktop:'PC / Escritorio', mobile:'Móvil / Tablet', vr:'VR · Meta Quest', ar:'AR' }[env] || env;
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

function _dismiss(overlay) {
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity .35s';
  setTimeout(() => overlay.remove(), 380);
}

function _injectStyles() {
  if (document.getElementById('launch-styles')) return;
  const s = document.createElement('style');
  s.id = 'launch-styles';
  s.textContent = `
    #launch-overlay {
      position:fixed;inset:0;z-index:9999;
      display:flex;align-items:center;justify-content:center;
    }
    .launch-bg {
      position:absolute;inset:0;
      background:radial-gradient(ellipse at 50% 40%,#0f3460 0%,#050510 70%);
    }
    .launch-card {
      position:relative;
      background:rgba(16,22,48,.95);
      border:1px solid #1a3a6a;border-radius:18px;
      padding:36px 32px 24px;max-width:680px;width:94%;
      box-shadow:0 8px 60px rgba(0,0,0,.8);
    }
    .launch-logo {
      font-size:44px;font-weight:900;letter-spacing:3px;
      color:#fff;text-align:center;line-height:1;
    }
    .launch-logo span{color:#e94560;}
    .launch-subtitle {
      text-align:center;color:#444;font-size:11px;
      letter-spacing:3px;text-transform:uppercase;margin:4px 0 20px;
    }
    .launch-device-info {
      display:flex;flex-wrap:wrap;gap:6px;
      justify-content:center;margin-bottom:18px;
    }
    .dev-badge {
      background:#0f2244;border:1px solid #1a3a6a;
      border-radius:20px;padding:4px 12px;font-size:11px;color:#8ab;
    }
    .launch-title {
      text-align:center;font-size:12px;color:#556;
      margin-bottom:14px;text-transform:uppercase;letter-spacing:1px;
    }
    .launch-grid {
      display:grid;grid-template-columns:1fr 1fr;gap:10px;
    }
    @media(max-width:500px){
      .launch-grid{grid-template-columns:1fr;}
      .launch-card{padding:22px 14px 18px;}
    }
    .env-btn {
      background:#070f24;border:1px solid #1a3a6a;border-radius:12px;
      padding:16px 14px 12px;cursor:pointer;
      display:flex;flex-direction:column;align-items:flex-start;gap:4px;
      text-align:left;transition:all .18s;position:relative;color:#bcd;
    }
    .env-btn:hover {
      border-color:#e94560;background:#120820;
      transform:translateY(-2px);
      box-shadow:0 6px 24px rgba(233,69,96,.2);
    }
    .env-btn:active{transform:scale(.98);}
    .env-btn.recommended{border-color:#e94560;box-shadow:0 0 0 1px #e94560 inset;}
    .env-btn.grayed{opacity:.5;}
    .env-btn.grayed:hover{opacity:.7;}
    .env-icon{font-size:28px;margin-bottom:4px;}
    .env-name{font-size:13px;font-weight:700;color:#e0e8ff;}
    .env-desc{font-size:10px;color:#556;}
    .env-badge {
      position:absolute;top:8px;right:8px;
      background:#e94560;color:#fff;
      font-size:9px;padding:2px 8px;border-radius:20px;
      text-transform:uppercase;letter-spacing:.5px;
    }
    .env-badge.gray{background:#223;}
    .launch-auto{margin-top:16px;text-align:center;}
    #launch-auto-btn {
      background:#e94560;border:none;color:#fff;
      padding:13px 36px;border-radius:10px;font-size:15px;
      cursor:pointer;transition:background .15s;
      display:inline-flex;gap:10px;align-items:center;
    }
    #launch-auto-btn:hover{background:#c73652;}
    .launch-note{
      margin-top:12px;text-align:center;font-size:10px;color:#334;
    }
  `;
  document.head.appendChild(s);
}
