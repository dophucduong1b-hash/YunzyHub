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
}

createRoot(document.getElementById('root')!).render(<App />);
