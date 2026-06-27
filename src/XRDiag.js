/**
 * XRDiag — diagnóstico WebXR visual en pantalla.
 * Muestra cada paso dentro del dispositivo (Quest, móvil, PC).
 * Accesible desde window.xrDiag o presionando el botón LOG.
 */
export class XRDiag {
  constructor() {
    this._lines = [];
    this._panel = null;
    this._build();
  }

  // ── Panel UI ───────────────────────────────────────────────────────────────

  _build() {
    const panel = document.createElement('div');
    panel.id = 'xr-diag-panel';
    panel.style.cssText = `
      position:fixed; top:50px; left:50%; transform:translateX(-50%);
      width:min(700px, 96vw);
      max-height:80vh; overflow-y:auto;
      background:rgba(5,8,20,.97);
      border:2px solid #e94560;
      border-radius:12px;
      padding:16px 18px;
      z-index:99999;
      display:none;
      font-family:monospace;
      font-size:13px;
      line-height:1.7;
      color:#ccc;
      box-shadow:0 8px 60px rgba(0,0,0,.9);
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <span style="color:#e94560;font-size:15px;font-weight:700">🔍 XR Diagnóstico</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="xr-diag-run"   style="background:#e94560;border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px">▶ Diagnosticar</button>
          <button id="xr-diag-vr"    style="background:#0f3460;border:2px solid #e94560;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">🥽 ENTRAR VR</button>
          <button id="xr-diag-vr2"   style="background:#1a0f2e;border:1px solid #cc5de8;color:#cc5de8;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px">🥽 VR (sin check)</button>
          <button id="xr-diag-close" style="background:#222;border:1px solid #444;color:#aaa;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px">✕ Cerrar</button>
        </div>
      </div>
      <div style="font-size:11px;color:#556;margin-bottom:10px">
        Primero pulsa <b style="color:#e94560">▶ Diagnosticar</b>, luego <b style="color:#e94560">🥽 ENTRAR VR</b> desde aquí (gesto directo)
      </div>
      <div id="xr-diag-log" style="white-space:pre-wrap;"></div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;
    this._logEl = panel.querySelector('#xr-diag-log');

    panel.querySelector('#xr-diag-run').onclick   = () => this.run();
    panel.querySelector('#xr-diag-close').onclick  = () => this.hide();

    // 🥽 ENTRAR VR — usa window.enterVR que llama xrManager.enterVR() directamente
    panel.querySelector('#xr-diag-vr').onclick = () => {
      this.log('→ Llamando window.enterVR() desde clic directo…', '#ffd43b');
      window.enterVR?.();
    };

    // Variante sin isSessionSupported previo (por si Quest Browser lo bloquea)
    panel.querySelector('#xr-diag-vr2').onclick = () => {
      this.log('→ requestSession directo sin isSessionSupported…', '#cc5de8');
      if (!navigator.xr) { this.err('navigator.xr no existe'); return; }
      const r = window._renderer;
      if (!r) { this.err('renderer no disponible'); return; }
      navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor'],
      }).then(session => {
        this.ok('requestSession OK — llamando setSession…');
        return r.xr.setSession(session);
      }).then(() => {
        this.ok('setSession OK — deberías estar en VR');
      }).catch(err => {
        this.err(`requestSession falló: ${err.name}: ${err.message}`);
        this.warn('Causas comunes:');
        this.warn('  • No es HTTPS → debe ser https://maurichilean3d.github.io/Mr3d-draw/');
        this.warn('  • Navegador no es Meta Quest Browser');
        this.warn('  • local-floor no soportado → prueba sin requiredFeatures');
      });
    };
  }

  show() { this._panel.style.display = 'block'; }
  hide() { this._panel.style.display = 'none'; }
  toggle() { this._panel.style.display === 'none' ? this.show() : this.hide(); }

  log(msg, color = '#ccc') {
    const ts = new Date().toLocaleTimeString('es', { hour12: false });
    this._lines.push({ ts, msg, color });
    if (this._logEl) {
      const line = document.createElement('div');
      line.innerHTML = `<span style="color:#555">${ts}</span> <span style="color:${color}">${msg}</span>`;
      this._logEl.appendChild(line);
      this._logEl.scrollTop = this._logEl.scrollHeight;
    }
    console.log(`[XRDiag] ${msg}`);
  }

  ok(msg)   { this.log('✅ ' + msg, '#51cf66'); }
  err(msg)  { this.log('❌ ' + msg, '#ff6b6b'); }
  warn(msg) { this.log('⚠️  ' + msg, '#ffd43b'); }
  info(msg) { this.log('ℹ️  ' + msg, '#74c0fc'); }
  sep()     { this.log('─'.repeat(50), '#333'); }

  clear() {
    this._lines = [];
    if (this._logEl) this._logEl.innerHTML = '';
  }

  // ── Diagnóstico completo ──────────────────────────────────────────────────

  async run() {
    this.clear();
    this.show();
    this.log('=== MR3D XR DIAGNÓSTICO ===', '#e94560');
    this.sep();

    // 1. Entorno básico
    this.info(`UserAgent: ${navigator.userAgent}`);
    this.info(`Protocolo: ${location.protocol}`);
    this.info(`Host: ${location.host}`);
    this.info(`URL: ${location.href}`);
    this.sep();

    // 2. Contexto seguro (requerido para WebXR)
    if (window.isSecureContext) {
      this.ok('isSecureContext = true (HTTPS o localhost)');
    } else {
      this.err('isSecureContext = FALSE — WebXR requiere HTTPS');
      this.err('Abre la página desde: https://maurichilean3d.github.io/Mr3d-draw/');
    }
    this.sep();

    // 3. navigator.xr
    if (!navigator.xr) {
      this.err('navigator.xr no existe');
      this.err('Soluciones:');
      this.warn('  → En Meta Quest: usa "Meta Quest Browser" (no Chrome/Firefox)');
      this.warn('  → En PC: activa WebXR en chrome://flags/#webxr');
      this.warn('  → La página debe ser HTTPS');
      return;
    }
    this.ok('navigator.xr existe');
    this.sep();

    // 4. isSessionSupported
    const modes = ['immersive-vr', 'immersive-ar', 'inline'];
    for (const mode of modes) {
      try {
        const supported = await navigator.xr.isSessionSupported(mode);
        if (supported) this.ok(`isSessionSupported('${mode}') = true`);
        else           this.warn(`isSessionSupported('${mode}') = false`);
      } catch (e) {
        this.err(`isSessionSupported('${mode}') lanzó error: ${e.message}`);
      }
    }
    this.sep();

    // 5. requestSession test (no se puede hacer sin gesto — se omite)
    this.info('requestSession NO se puede probar aquí (requiere gesto directo)');
    this.info('Usa el botón "🥽 Entrar VR" dentro de este panel para probarlo');
    this.sep();

    // 6. renderer.xr
    const renderer = window._renderer;
    if (renderer) {
      this.info(`renderer.xr.enabled = ${renderer.xr.enabled}`);
      this.info(`renderer.xr.isPresenting = ${renderer.xr.isPresenting}`);
      const session = renderer.xr.getSession();
      this.info(`renderer.xr.getSession() = ${session ? 'sesión activa' : 'null (sin sesión)'}`);
    } else {
      this.warn('renderer no expuesto (window._renderer no definido)');
    }
    this.sep();

    // 7. Detección de dispositivo
    const ua = navigator.userAgent;
    if (/OculusBrowser|Quest/i.test(ua))  this.ok('Dispositivo: Meta Quest detectado');
    else if (/Android/i.test(ua))          this.info('Dispositivo: Android');
    else if (/iPhone|iPad/i.test(ua))      this.info('Dispositivo: iOS');
    else                                    this.info('Dispositivo: PC / Escritorio');

    this.sep();
    this.log('=== FIN DIAGNÓSTICO ===', '#e94560');
    this.info('Si immersive-vr = true → usa el botón "🥽 Entrar VR" arriba');
    this.info('Si immersive-vr = false → revisa HTTPS y el navegador');
  }
}
