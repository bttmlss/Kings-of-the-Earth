import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Crown, ChevronRight, Vote } from "lucide-react";
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
      <div className="relative w-full max-w-[280px] sm:max-w-[300px] h-[175px] flex justify-center items-end pb-3">
        <AnimatePresence mode="popLayout">
          {visibleCards.map(({ candidate, indexInStack, keyId }) => {
            // Index 0: Foreground / Active Card
            // Index 1: Second Card / Stack Level 1
            // Index 2: Third Card / Stack Level 2

            // Visual transformation calculations for dynamic depth stacking
            const scale = 1 - indexInStack * 0.05;
            const yOffset = -indexInStack * 12;
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
                    ? { opacity: 0, scale: 0.7, y: -30 }
                    : { opacity, scale, y: yOffset }
                }
                animate={{
                  opacity,
                  scale,
                  y: yOffset,
                  transition: { type: "spring", stiffness: 350, damping: 28 }
                }}
                exit={{
                  x: -280,
                  rotate: -12,
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: 0.35, ease: "easeInOut" }
                }}
                className={`absolute w-full max-w-[260px] sm:max-w-[285px] bg-white dark:bg-slate-950 border ${
                  isForeground
                    ? "border-amber-500/50 shadow-md shadow-amber-500/5 dark:shadow-amber-500/10"
                    : "border-slate-200 dark:border-slate-850 shadow-sm"
                } rounded-2xl overflow-hidden text-left flex flex-col justify-between h-[145px] cursor-pointer transition-colors duration-150`}
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
                {/* Miniature Banner */}
                <div className="h-11 w-full relative overflow-hidden bg-slate-100 dark:bg-slate-900 shrink-0">
                  {candidate.bannerURL ? (
                    <img
                      src={candidate.bannerURL}
                      alt="Campaign Banner"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-amber-500/10 to-amber-500/20" />
                  )}
                  {/* Banner Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                  {/* Top-Right Badge (Votes) */}
                  <div className="absolute top-1.5 right-2 px-1.5 py-0.5 rounded bg-amber-500/90 text-[7px] font-mono font-bold tracking-wider text-white flex items-center gap-1 shadow-xs">
                    <Vote className="w-2 h-2" />
                    <span>{candidate.voteCount || 0} VOTES</span>
                  </div>

                  {/* Floating Avatar & Claimant Info */}
                  <div className="absolute bottom-1 left-2.5 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-white dark:border-slate-800 bg-slate-300 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {candidate.photoURL ? (
                        <img
                          src={candidate.photoURL}
                          alt={candidate.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[8px]">👑</span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] text-white font-black tracking-tight truncate max-w-[120px]">
                        {candidate.displayName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Info Body */}
                <div className="p-2.5 flex-1 flex flex-col justify-between overflow-hidden">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Crown className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      <span className="text-[7px] font-mono font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                        {indexInStack === 0 ? "Featured" : "Up Next"}
                      </span>
                    </div>
                    <h4 className="font-display font-black text-[11px] text-slate-800 dark:text-white uppercase tracking-tight line-clamp-1">
                      {candidate.campaignTitle || `${candidate.displayName}'s Campaign`}
                    </h4>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight font-sans">
                      {candidate.bio || "An active contender in this sovereign domain."}
                    </p>
                  </div>

                  {/* Action prompt */}
                  {isForeground && (
                    <div className="flex items-center justify-end text-[8px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider gap-0.5 group mt-1">
                      <span>Enter</span>
                      <ChevronRight className="w-2.5 h-2.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
