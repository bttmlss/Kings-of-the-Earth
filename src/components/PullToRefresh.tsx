import React, { useState, useEffect, useRef } from "react";
import { RefreshCw, Crown, Sparkles, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  key?: React.Key;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const hasDeterminedDirectionRef = useRef(false);

  const THRESHOLD = 80;
  const MAX_PULL = 120;

  const pullDistanceRef = useRef(0);
  pullDistanceRef.current = pullDistance;

  const isRefreshingRef = useRef(isRefreshing);
  isRefreshingRef.current = isRefreshing;

  const showSuccessRef = useRef(showSuccess);
  showSuccessRef.current = showSuccess;

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Recursively check if the user is at the scroll top of any container up to our wrapper
  const isAtScrollTop = (target: HTMLElement | null, stopElement: HTMLElement | null): boolean => {
    let curr = target;
    while (curr && curr !== stopElement) {
      if (curr.scrollTop > 0) {
        return false;
      }
      curr = curr.parentElement;
    }
    const docScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (docScrollTop > 0) return false;
    return true;
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const isAtTop = isAtScrollTop(target, element);
      if (!isAtTop || isRefreshingRef.current || showSuccessRef.current) {
        isPullingRef.current = false;
        return;
      }

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      isPullingRef.current = true;
      hasDeterminedDirectionRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current || showSuccessRef.current) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - startYRef.current;
      const diffX = Math.abs(currentX - startXRef.current);

      // Determine drag intent
      if (!hasDeterminedDirectionRef.current) {
        const totalMove = Math.sqrt(diffY * diffY + diffX * diffX);
        if (totalMove > 8) {
          if (diffX > Math.abs(diffY)) {
            // Horizontal scroll detected (carousel or other swiper) - abort pull-to-refresh
            isPullingRef.current = false;
            setPullDistance(0);
            return;
          } else {
            // Vertical movement
            hasDeterminedDirectionRef.current = true;
          }
        } else {
          return;
        }
      }

      if (diffY > 0) {
        // Active downward pull: cancel default browser behavior to prevent native rubber-banding
        if (e.cancelable) {
          e.preventDefault();
        }
        const rawDistance = diffY * 0.45;
        const finalDistance = Math.min(MAX_PULL, rawDistance);
        setPullDistance(finalDistance);
      } else {
        // Upward drag: cancel pull-to-refresh
        isPullingRef.current = false;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      const currentPull = pullDistanceRef.current;
      if (currentPull >= THRESHOLD) {
        setIsRefreshing(true);
        setPullDistance(THRESHOLD); // Rest at threshold for visible refreshing spinner

        try {
          await onRefreshRef.current();
          setShowSuccess(true);
          setIsRefreshing(false);
          setTimeout(() => {
            setShowSuccess(false);
            setPullDistance(0);
          }, 1200);
        } catch (err) {
          console.error("Refresh error:", err);
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const progress = Math.min(100, (pullDistance / THRESHOLD) * 100);

  return (
    <div 
      ref={containerRef}
      className="relative w-full"
      style={{ touchAction: pullDistance > 0 ? "none" : "auto" }}
    >
      {/* Pull Indicator Area */}
      <div 
        className="overflow-hidden transition-all duration-200 ease-out flex flex-col items-center justify-end select-none pointer-events-none"
        style={{ 
          height: `${pullDistance}px`,
          opacity: pullDistance > 0 ? 1 : 0
        }}
      >
        <div className="pb-3 flex flex-col items-center gap-1.5 transition-all">
          <div className="relative flex items-center justify-center">
            {/* Background ring */}
            <div className="absolute w-10 h-10 rounded-full bg-slate-200/80 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 shadow-md backdrop-blur-md" />
            
            {showSuccess ? (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="relative z-10 w-10 h-10 flex items-center justify-center"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 stroke-[2.5]" />
              </motion.div>
            ) : isRefreshing ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="relative z-10 w-10 h-10 flex items-center justify-center"
              >
                <RefreshCw className="w-5 h-5 text-amber-500 animate-pulse" />
              </motion.div>
            ) : (
              <motion.div 
                style={{ rotate: `${progress * 3.6}deg`, scale: Math.max(0.7, progress / 100) }}
                className="relative z-10 w-10 h-10 flex items-center justify-center"
              >
                <Crown className="w-5 h-5 text-amber-500/80" />
              </motion.div>
            )}
          </div>

          <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1">
            {showSuccess ? (
              <span className="text-emerald-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
                Domains Synced
              </span>
            ) : isRefreshing ? (
              <span className="text-amber-500 animate-pulse">Consulting Oracle...</span>
            ) : progress >= 100 ? (
              <span className="text-amber-400 animate-bounce">Release to Refresh</span>
            ) : (
              <span>Pull to Synchronize</span>
            )}
          </div>
        </div>
      </div>

      {/* Main wrapped screen/content */}
      <div 
        className="transition-transform duration-200 ease-out"
        style={{ 
          transform: pullDistance > 0 && !isRefreshing && !showSuccess
            ? `translateY(${pullDistance * 0.3}px)` 
            : "translateY(0)"
        }}
      >
        {children}
      </div>
    </div>
  );
}
