/**
 * Splash / environment picker shown before entering the app.
 * Returns a Promise<'desktop'|'mobile'|'vr'|'ar'>.
 */
export function showLaunchScreen(deviceInfo) {
  return new Promise(resolve => {
    const recommended = _recommend(deviceInfo);

    const overlay = document.createElement('div');
    overlay.id = 'launch-overlay';
    overlay.innerHTML = `
      <div class="launch-bg"></div>
      <div class="launch-card">
        <div class="launch-logo">MR<span>3D</span></div>
        <div class="launch-subtitle">Blender-style 3D Modeler · WebMR</div>

        <div class="launch-device-info">
          ${_deviceBadges(deviceInfo)}
        </div>

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
            <span class="env-desc">Controles táctiles optimizados</span>
            ${recommended==='mobile'?'<span class="env-badge">Recomendado</span>':''}
          </button>
          <button class="env-btn ${recommended==='vr'?'recommended':''} ${!deviceInfo.supportsVR?'disabled':''}" data-env="vr">
            <span class="env-icon">🥽</span>
            <span class="env-name">VR / Meta Quest</span>
            <span class="env-desc">Modelado inmersivo con controles</span>
            ${recommended==='vr'?'<span class="env-badge">Recomendado</span>':''}
            ${!deviceInfo.supportsVR?'<span class="env-badge unavailable">No disponible</span>':''}
          </button>
          <button class="env-btn ${recommended==='ar'?'recommended':''} ${!deviceInfo.supportsAR?'disabled':''}" data-env="ar">
            <span class="env-icon">📷</span>
            <span class="env-name">AR / Realidad Aumentada</span>
            <span class="env-desc">Modela sobre el mundo real</span>
            ${recommended==='ar'?'<span class="env-badge">Recomendado</span>':''}
            ${!deviceInfo.supportsAR?'<span class="env-badge unavailable">No disponible</span>':''}
          </button>
        </div>

        <div class="launch-auto">
          <button id="launch-auto-btn">
            ▶ Entrar con modo recomendado
            <strong>${_envLabel(recommended)}</strong>
          </button>
        </div>
      </div>
    `;

    _injectStyles();
    document.body.appendChild(overlay);

    // Auto-select on button clicks
    overlay.querySelectorAll('.env-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        _dismiss(overlay);
        resolve(btn.dataset.env);
      });
    });

    // Disabled buttons: tooltip only
    overlay.querySelectorAll('.env-btn.disabled').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.style.animation = 'shake .3s ease';
        setTimeout(() => btn.style.animation = '', 400);
      });
    });

    document.getElementById('launch-auto-btn').addEventListener('click', () => {
      _dismiss(overlay);
      resolve(recommended);
    });
  });
}

function _recommend(info) {
  if (info.isQuest || info.supportsVR) return 'vr';
  if (info.supportsAR && info.isMobile) return 'ar';
  if (info.isMobile || info.isTablet) return 'mobile';
  return 'desktop';
}

function _envLabel(env) {
  return { desktop:'PC / Escritorio', mobile:'Móvil / Tablet', vr:'VR / Meta Quest', ar:'AR' }[env] || env;
}

function _deviceBadges(info) {
  const badges = [];
  if (info.isQuest) badges.push('Meta Quest detectado');
  else if (info.isTablet) badges.push('Tablet detectada');
  else if (info.isMobile) badges.push('Móvil detectado');
  else badges.push('PC / Escritorio');
  if (info.supportsVR) badges.push('WebXR VR ✓');
  if (info.supportsAR) badges.push('WebXR AR ✓');
  return badges.map(b => `<span class="dev-badge">${b}</span>`).join('');
}

function _dismiss(overlay) {
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity .4s ease';
  setTimeout(() => overlay.remove(), 400);
}

function _injectStyles() {
  if (document.getElementById('launch-styles')) return;
  const s = document.createElement('style');
  s.id = 'launch-styles';
  s.textContent = `
    #launch-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
    }
    .launch-bg {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 40%, #0f3460 0%, #0a0a1a 70%);
    }
    .launch-card {
      position: relative;
      background: rgba(22,33,62,.92);
      border: 1px solid #0f3460;
      border-radius: 16px;
      padding: 36px 32px 28px;
      max-width: 680px; width: 94%;
      box-shadow: 0 8px 60px rgba(0,0,0,.7);
      backdrop-filter: blur(12px);
    }
    .launch-logo {
      font-size: 42px; font-weight: 900; letter-spacing: 3px;
      color: #fff; text-align: center;
    }
    .launch-logo span { color: #e94560; }
    .launch-subtitle {
      text-align: center; color: #555; font-size: 12px;
      letter-spacing: 2px; text-transform: uppercase; margin: 4px 0 18px;
    }
    .launch-device-info {
      display: flex; flex-wrap: wrap; gap: 6px;
      justify-content: center; margin-bottom: 20px;
    }
    .dev-badge {
      background: #0f3460; border: 1px solid #1a4a8a;
      border-radius: 20px; padding: 3px 10px;
      font-size: 11px; color: #aaa;
    }
    .launch-title {
      text-align: center; font-size: 13px; color: #888;
      margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px;
    }
    .launch-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    @media (max-width: 500px) {
      .launch-grid { grid-template-columns: 1fr; }
      .launch-card { padding: 24px 16px 20px; }
    }
    .env-btn {
      background: #0f1e3d;
      border: 1px solid #0f3460;
      border-radius: 10px;
      padding: 14px 12px 12px;
      cursor: pointer;
      display: flex; flex-direction: column; align-items: flex-start;
      gap: 3px; text-align: left;
      transition: all .18s; position: relative;
      color: #ccc;
    }
    .env-btn:hover:not(.disabled) {
      border-color: #e94560; background: #1a0f2e;
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(233,69,96,.2);
    }
    .env-btn.recommended {
      border-color: #e94560;
      box-shadow: 0 0 0 1px #e94560 inset;
    }
    .env-btn.disabled { opacity: .35; cursor: not-allowed; }
    .env-icon { font-size: 26px; margin-bottom: 4px; }
    .env-name { font-size: 13px; font-weight: 600; color: #e0e0e0; }
    .env-desc { font-size: 10px; color: #666; }
    .env-badge {
      position: absolute; top: 8px; right: 8px;
      background: #e94560; color: #fff;
      font-size: 9px; padding: 2px 7px; border-radius: 20px;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .env-badge.unavailable { background: #333; }
    .launch-auto {
      margin-top: 16px; text-align: center;
    }
    #launch-auto-btn {
      background: #e94560; border: none; color: #fff;
      padding: 12px 32px; border-radius: 8px; font-size: 14px;
      cursor: pointer; transition: background .15s;
      display: inline-flex; gap: 8px; align-items: center;
    }
    #launch-auto-btn:hover { background: #c73652; }
    @keyframes shake {
      0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)}
    }
  `;
  document.head.appendChild(s);
}
