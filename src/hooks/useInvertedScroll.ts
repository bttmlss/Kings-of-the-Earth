import React, { useEffect } from 'react';

export function useInvertedScroll(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startY = 0;
    let startScrollTop = 0;

    const handleWheel = (e: WheelEvent) => {
      // Ignore if scrolling inside a nested scrollable element that isn't the container
      let target = e.target as HTMLElement | null;
      let shouldInvert = false;
      while (target && target !== document.body) {
        if (target === container) {
          shouldInvert = true;
          break;
        }
        if (target.scrollHeight > target.clientHeight) {
           // It's a nested scroll container
           // We might want to invert this too, but let's just stick to the main container for now
           // Or invert all scrollable elements?
           // The prompt says "invert the scrolling of the app"
        }
        target = target.parentElement;
      }
      
      if (!shouldInvert) return;
      
      e.preventDefault();
      container.scrollTop -= e.deltaY;
    };

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startScrollTop = container.scrollTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      let shouldInvert = false;
      while (target && target !== document.body) {
        if (target === container) {
          shouldInvert = true;
          break;
        }
        target = target.parentElement;
      }
      
      if (!shouldInvert) return;
      
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY; // positive if swiping down
      
      // Normally, swiping down (deltaY > 0) scrolls UP (decreases scrollTop).
      // We want inverted: swiping down (deltaY > 0) scrolls DOWN (increases scrollTop).
      e.preventDefault();
      container.scrollTop = startScrollTop + deltaY;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [containerRef]);
}
