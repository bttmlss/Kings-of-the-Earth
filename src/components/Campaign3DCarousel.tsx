import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Candidate } from "../types";

interface Campaign3DCarouselProps {
  candidates: Candidate[];
  userProfiles?: any[];
  onViewProfile?: (user: { uid: string; displayName: string; photoURL: string | null }) => void;
  setSelectedCandidate?: (c: any) => void;
}

export default function Campaign3DCarousel({
  candidates = [],
  setSelectedCandidate
}: Campaign3DCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // If there are no candidates, return empty or helper text
  if (!candidates || candidates.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-[200px] text-center border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950 p-6">
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">[ No active campaigns in this domain ]</p>
      </div>
    );
  }

  const N = candidates.length;

  // Build the array of cards to display. We want up to 3 cards.
  // In a 3D stack:
  // - card 0 is in the front (activeIndex % N)
  // - card 1 is behind it ((activeIndex + 1) % N)
  // - card 2 is further behind ((activeIndex + 2) % N)
  const visibleCards = [];
  const limit = Math.min(3, N);
  for (let i = 0; i < limit; i++) {
    const candidate = candidates[(activeIndex + i) % N];
    visibleCards.push({
      candidate,
      indexInStack: i,
      // Create a stable key so React transitions are smooth
      keyId: `${candidate.id || candidate.userId}-${(activeIndex + i) % N}`
    });
  }

  // Handle rotating to the next card
  const handleRotateNext = () => {
    setActiveIndex((prev) => prev + 1);
    // Reset auto-play timer on user interaction
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
    }
    if (isAutoPlaying) {
      startAutoPlay();
    }
  };

  // Auto-play cycling mechanism
  const startAutoPlay = () => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
    }
    autoPlayTimerRef.current = setInterval(() => {
      setActiveIndex((prev) => prev + 1);
    }, 5000); // cycle every 5 seconds
  };

  useEffect(() => {
    if (isAutoPlaying && N > 1) {
      startAutoPlay();
    }
    return () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
    };
  }, [isAutoPlaying, N]);

  return (
    <div className="relative w-full flex flex-col items-center select-none pt-1 pb-1">
      {/* 3D Stack Container */}
      <div className="relative w-full max-w-[140px] sm:max-w-[150px] h-[90px] flex justify-center items-end pb-1">
        <AnimatePresence mode="popLayout">
          {visibleCards.map(({ candidate, indexInStack, keyId }) => {
            // Index 0: Foreground / Active Card
            // Index 1: Second Card / Stack Level 1
            // Index 2: Third Card / Stack Level 2

            // Visual transformation calculations for dynamic depth stacking
            const scale = 1 - indexInStack * 0.05;
            const xOffset = indexInStack * 25; // Shift right to see cards behind
            const opacity = 1 - indexInStack * 0.25;
            const zIndex = 30 - indexInStack * 10;

            const isForeground = indexInStack === 0;

            return (
              <motion.div
                key={keyId}
                layout
                style={{ zIndex }}
                initial={
                  indexInStack === 2
                    ? { opacity: 0, scale: 0.7, x: 50, y: 0 }
                    : { opacity, scale, x: xOffset, y: 0 }
                }
                animate={{
                  opacity,
                  scale,
                  x: xOffset,
                  y: 0,
                  transition: { type: "spring", stiffness: 350, damping: 28 }
                }}
                exit={{
                  x: -150,
                  rotate: -12,
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: 0.35, ease: "easeInOut" }
                }}
                className={`absolute w-full max-w-[130px] sm:max-w-[140px] bg-white dark:bg-slate-950 border ${
                  isForeground
                    ? "border-amber-500/50 shadow-md shadow-amber-500/5 dark:shadow-amber-500/10"
                    : "border-slate-200 dark:border-slate-850 shadow-sm"
                } rounded-2xl overflow-hidden text-left flex flex-col justify-between h-[80px] cursor-pointer transition-colors duration-150`}
                onClick={() => {
                  if (isForeground) {
                    if (setSelectedCandidate) {
                      setSelectedCandidate(candidate);
                    }
                  } else {
                    // Clicking on background cards brings them to the front
                    handleRotateNext();
                  }
                }}
              >
                {/* Full-Card Banner Image */}
                <div className="absolute inset-0 z-0">
                  {candidate.bannerURL ? (
                    <img
                      src={candidate.bannerURL}
                      alt="Campaign Banner"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-amber-500/10 to-amber-500/20" />
                  )}
                  {/* Banner Overlay to make text readable */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
                </div>

                {/* Content Overlay */}
                <div className="relative z-10 w-full h-full p-3 flex flex-col justify-end">
                  <h4 className="font-display font-black text-[11px] text-white uppercase tracking-tight line-clamp-2 leading-tight mb-1.5 drop-shadow-md">
                    {candidate.campaignTitle || `${candidate.displayName}'s Campaign`}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full overflow-hidden border-2 border-white/90 bg-slate-800 flex items-center justify-center shrink-0 shadow-sm">
                      {candidate.photoURL ? (
                        <img
                          src={candidate.photoURL}
                          alt={candidate.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[7px]">👑</span>
                      )}
                    </div>
                    <span className="text-[9px] text-white font-bold tracking-tight truncate drop-shadow-sm">
                      {candidate.displayName}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
