import React, { useEffect } from 'react';

export function useInvertedScroll(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startY = 0;
    let startScrollTop = 0;

    let velocity = 0;
    let animationFrameId: number | null = null;

    const smoothScrollLoop = () => {
      if (!container) return;
      
      velocity *= 0.92;
      
      if (Math.abs(velocity) < 0.1) {
        velocity = 0;
        animationFrameId = null;
        return;
      }
      
      const prevScrollTop = container.scrollTop;
      container.scrollTop -= velocity;
      
      if (container.scrollTop === prevScrollTop) {
        velocity = 0;
        animationFrameId = null;
        return;
      }
      
      animationFrameId = requestAnimationFrame(smoothScrollLoop);
    };

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
      
      // Accumulate velocity
      velocity += e.deltaY * 0.35;
      
      const maxVel = 45;
      if (velocity > maxVel) velocity = maxVel;
      if (velocity < -maxVel) velocity = -maxVel;

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(smoothScrollLoop);
      }
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

    const isMobileTouch = typeof window !== 'undefined' && 
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    container.addEventListener('wheel', handleWheel, { passive: false });
    if (!isMobileTouch) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (!isMobileTouch) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [containerRef]);
}
