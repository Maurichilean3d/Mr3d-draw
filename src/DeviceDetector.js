/**
 * Detects device capabilities and recommends a working environment.
 */
export class DeviceDetector {
  static async detect() {
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    const isTablet = /iPad/i.test(ua) || (isMobile && Math.min(screen.width, screen.height) > 600);
    const isQuest = /OculusBrowser|Quest/i.test(ua);

    const xr = navigator.xr;
    let supportsVR = false;
    let supportsAR = false;

    if (xr) {
      try { supportsVR = await xr.isSessionSupported('immersive-vr'); } catch {}
      try { supportsAR = await xr.isSessionSupported('immersive-ar'); } catch {}
    }

    return { isMobile, isTablet, isQuest, supportsVR, supportsAR };
  }

  static recommend(info) {
    if (info.isQuest || info.supportsVR) return 'vr';
    if (info.supportsAR) return 'ar';
    if (info.isMobile || info.isTablet) return 'mobile';
    return 'desktop';
  }
}
