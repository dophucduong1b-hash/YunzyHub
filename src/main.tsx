import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Lock viewport scale against iOS Safari pinch-to-zoom, gesture zoom, and Ctrl+wheel zoom
if (typeof document !== 'undefined') {
  const preventZoom = (event: Event) => {
    event.preventDefault();
  };

  document.addEventListener('gesturestart', preventZoom, {passive: false});
  document.addEventListener('gesturechange', preventZoom, {passive: false});
  document.addEventListener('gestureend', preventZoom, {passive: false});

  document.addEventListener(
    'touchmove',
    (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    {passive: false}
  );

  document.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    },
    {passive: false}
  );

  // Compensate for iOS standalone PWA (black-translucent + viewport-fit=cover) WebKit bug
  // where `position: fixed; inset: 0` stops ~env(safe-area-inset-top) (~59px) short of the physical bottom.
  const syncIOSStandaloneViewportFix = () => {
    if (typeof window === 'undefined' || !document.body) return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as {standalone?: boolean}).standalone === true;
    const isIOS =
      /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    if (!isStandalone || !isIOS) {
      document.documentElement.style.setProperty('--ios-viewport-bottom-fix', '0px');
      return;
    }

    const isLandscape = window.innerWidth > window.innerHeight;
    const physicalWidth = isLandscape
      ? Math.max(window.screen.width, window.screen.height)
      : Math.min(window.screen.width, window.screen.height);
    const physicalHeight = isLandscape
      ? Math.min(window.screen.width, window.screen.height)
      : Math.max(window.screen.width, window.screen.height);

    // Do not apply in iPad Split View / Slide Over where viewport does not span screen width
    if (Math.abs(window.innerWidth - physicalWidth) > 4) {
      document.documentElement.style.setProperty('--ios-viewport-bottom-fix', '0px');
      return;
    }

    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;inset:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;z-index:-1;';
    document.body.appendChild(probe);

    const rect = probe.getBoundingClientRect();
    const styles = window.getComputedStyle(probe);
    const safeTop = parseFloat(styles.paddingTop) || 0;
    const safeBottom = parseFloat(styles.paddingBottom) || 0;
    probe.remove();

    if (safeTop <= 16) {
      document.documentElement.style.setProperty('--ios-viewport-bottom-fix', '0px');
      return;
    }

    const currentFix =
      parseFloat(document.documentElement.style.getPropertyValue('--ios-viewport-bottom-fix')) || 0;
    const delta = Math.round(physicalHeight - rect.height);
    const neededFix = currentFix + delta;
    const maxBugShortfall = Math.round(safeTop + safeBottom + 16);

    if (neededFix >= 0 && neededFix <= maxBugShortfall) {
      document.documentElement.style.setProperty(
        '--ios-viewport-bottom-fix',
        neededFix > 16 ? `${neededFix}px` : '0px'
      );
    }
    // If neededFix > maxBugShortfall, the iOS software keyboard is open; preserve existing value.
  };

  window.requestAnimationFrame(syncIOSStandaloneViewportFix);
  window.setTimeout(syncIOSStandaloneViewportFix, 150);
  window.addEventListener('resize', syncIOSStandaloneViewportFix);
  window.addEventListener('pageshow', syncIOSStandaloneViewportFix);
  window.addEventListener('orientationchange', () => {
    window.setTimeout(syncIOSStandaloneViewportFix, 150);
  });
}

createRoot(document.getElementById('root')!).render(<App />);
