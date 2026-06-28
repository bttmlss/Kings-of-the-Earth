import { useEffect } from 'react';

export function useGlobalInvertedScroll() {
  useEffect(() => {
    const isSnapContainer = (el: HTMLElement): boolean => {
      if (el.id === 'profile-screen-container' || el.id === 'candidate-campaign-container') return true;
      const style = window.getComputedStyle(el);
      const scrollSnapType = style.scrollSnapType || (style as any).webkitScrollSnapType || '';
      if (scrollSnapType && scrollSnapType !== 'none') return true;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/);
        if (classes.some(c => c === 'snap-y' || c === 'snap-x' || c === 'snap-both' || c === 'snap-mandatory' || c === 'snap-proximity')) {
          return true;
        }
      }
      return false;
    };

    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      if (!node) return null;
      if (node.nodeType !== 1) return getScrollParent(node.parentElement);
      
      if (node === document.body || node === document.documentElement) {
        const scrollingEl = document.scrollingElement as HTMLElement;
        if (scrollingEl && scrollingEl.scrollHeight > scrollingEl.clientHeight + 1) {
          const bodyStyle = window.getComputedStyle(document.body);
          if (bodyStyle.overflowY !== 'hidden' && bodyStyle.overflow !== 'hidden') {
            if (isSnapContainer(scrollingEl)) return null;
            return scrollingEl;
          }
        }
        return null;
      }
      
      if (node.scrollHeight > node.clientHeight + 1) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
          if (isSnapContainer(node)) return null;
          return node;
        }
      }
      
      return getScrollParent(node.parentElement);
    };

    let startY = 0;
    let startScrollTop = 0;
    let activeScrollParent: HTMLElement | null = null;
    let isTouching = false;

    let velocity = 0;
    let animationFrameId: number | null = null;
    let currentScrollParent: HTMLElement | null = null;

    const smoothScrollLoop = () => {
      if (!currentScrollParent) return;
      
      // Decelerate with a smooth friction coefficient
      velocity *= 0.88;
      
      if (Math.abs(velocity) < 0.1) {
        velocity = 0;
        animationFrameId = null;
        return;
      }
      
      const prevScrollTop = currentScrollParent.scrollTop;
      currentScrollParent.scrollTop -= velocity;
      
      if (currentScrollParent.scrollTop === prevScrollTop) {
        velocity = 0;
        animationFrameId = null;
        return;
      }
      
      animationFrameId = requestAnimationFrame(smoothScrollLoop);
    };
 
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      
      let target = e.target as HTMLElement;
      if (target && target.nodeType === 3) target = target.parentNode as HTMLElement;
      
      let checkTarget: HTMLElement | null = target;
      while (checkTarget && checkTarget !== document.body) {
        if (checkTarget.classList && checkTarget.classList.contains('no-invert-scroll')) {
          return; // Ignore inverted scroll for this element and its children
        }
        checkTarget = checkTarget.parentElement;
      }
      
      const scrollParent = getScrollParent(target);
      
      if (scrollParent) {
        e.preventDefault();
        
        if (currentScrollParent !== scrollParent) {
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
          currentScrollParent = scrollParent;
          velocity = 0;
        }
 
        // Accumulate velocity with a responsive factor
        velocity += e.deltaY * 0.18;
        
        // Bound max velocity to keep it predictable
        const maxVel = 25;
        if (velocity > maxVel) velocity = maxVel;
        if (velocity < -maxVel) velocity = -maxVel;

        if (animationFrameId === null) {
          animationFrameId = requestAnimationFrame(smoothScrollLoop);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      let target = e.target as HTMLElement;
      if (target && target.nodeType === 3) target = target.parentNode as HTMLElement;
      
      let checkTarget: HTMLElement | null = target;
      while (checkTarget && checkTarget !== document.body) {
        if (checkTarget.classList && checkTarget.classList.contains('no-invert-scroll')) {
          return;
        }
        checkTarget = checkTarget.parentElement;
      }
      
      activeScrollParent = getScrollParent(target);
      if (activeScrollParent) {
        startY = e.touches[0].clientY;
        startScrollTop = activeScrollParent.scrollTop;
        isTouching = true;
      } else {
        isTouching = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching || !activeScrollParent) return;
      
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY;
      
      if (e.defaultPrevented) return;
      
      if (e.cancelable) {
        e.preventDefault();
      }
      
      activeScrollParent.scrollTop = startScrollTop + deltaY;
    };

    const handleTouchEnd = () => {
      isTouching = false;
      activeScrollParent = null;
    };

    const isMobileTouch = typeof window !== 'undefined' && 
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    
    if (!isMobileTouch) {
      window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
      window.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });
    }

    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (!isMobileTouch) {
        window.removeEventListener('touchstart', handleTouchStart, { capture: true });
        window.removeEventListener('touchmove', handleTouchMove, { capture: true });
        window.removeEventListener('touchend', handleTouchEnd, { capture: true });
        window.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
      }
    };
  }, []);
}

