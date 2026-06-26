import { useEffect } from 'react';

export function useGlobalInvertedScroll() {
  useEffect(() => {
    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      if (!node) return null;
      if (node.nodeType !== 1) return getScrollParent(node.parentElement);
      
      if (node === document.body || node === document.documentElement) {
        const scrollingEl = document.scrollingElement as HTMLElement;
        if (scrollingEl && scrollingEl.scrollHeight > scrollingEl.clientHeight + 1) {
          const bodyStyle = window.getComputedStyle(document.body);
          if (bodyStyle.overflowY !== 'hidden' && bodyStyle.overflow !== 'hidden') {
            return scrollingEl;
          }
        }
        return null;
      }
      
      if (node.scrollHeight > node.clientHeight + 1) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
          return node;
        }
      }
      
      return getScrollParent(node.parentElement);
    };

    let startY = 0;
    let startScrollTop = 0;
    let activeScrollParent: HTMLElement | null = null;
    let isTouching = false;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      
      let target = e.target as HTMLElement;
      if (target && target.nodeType === 3) target = target.parentNode as HTMLElement;
      
      const scrollParent = getScrollParent(target);
      
      if (scrollParent) {
        e.preventDefault();
        scrollParent.scrollTop -= e.deltaY;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      let target = e.target as HTMLElement;
      if (target && target.nodeType === 3) target = target.parentNode as HTMLElement;
      
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

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });

    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      window.removeEventListener('touchstart', handleTouchStart, { capture: true });
      window.removeEventListener('touchmove', handleTouchMove, { capture: true });
      window.removeEventListener('touchend', handleTouchEnd, { capture: true });
      window.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
    };
  }, []);
}

