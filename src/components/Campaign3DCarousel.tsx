import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Crown, Sparkles, ChevronRight, User, RefreshCw, Zap, Award } from "lucide-react";
import { Candidate } from "../types";

interface UserProfileSimple {
  uid: string;
  displayName: string;
  photoURL: string | null;
  bio?: string | null;
  prestige: number;
  domainCount: number;
  keyId: string;
}

interface Campaign3DCarouselProps {
  candidates: Candidate[];
  userProfiles: any[];
  onViewProfile: (user: { uid: string; displayName: string; photoURL: string | null }) => void;
  setSelectedCandidate?: (c: any) => void;
}

export default function Campaign3DCarousel({
  candidates,
  userProfiles,
  onViewProfile,
  setSelectedCandidate
}: Campaign3DCarouselProps) {
  // We'll manage exactly 3 visible cards in the rotation pool
  const [visibleCards, setVisibleCards] = useState<UserProfileSimple[]>([]);
  // Exactly 1 pre-fetched card in the pipeline backlog
  const [backlogCard, setBacklogCard] = useState<UserProfileSimple | null>(null);
  const [isFetchingBacklog, setIsFetchingBacklog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep track of card rotation index or direction
  const [rotationCount, setRotationCount] = useState(0);

  // Auto-play interval ref
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Helper to construct a card data object from candidate or user profile
  const mapToProfileCard = (source: any): UserProfileSimple => {
    // Determine the user's display name, bio, etc.
    const uid = source.uid || source.userId || source.id || "";
    const displayName = source.displayName || "Sovereign Player";
    const photoURL = source.photoURL || source.userPhotoURL || null;
    const bio = source.bio || source.caption || "An active contender in the sovereign realm of Kings of the Earth.";
    
    // Assign some elegant royal stats
    const hash = uid.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const prestige = (source.voteCount !== undefined ? source.voteCount * 120 : (hash % 15) * 210 + 420);
    const domainCount = (hash % 4) + 1;

    return {
      uid,
      displayName,
      photoURL,
      bio,
      prestige,
      domainCount,
      keyId: `${uid}-${Math.random().toString(36).substring(2, 9)}`
    };
  };

  // Select a random ID from userProfiles that isn't currently visible or in backlog
  const getNextAvailableProfileId = (currentVisible: UserProfileSimple[], currentBacklog: UserProfileSimple | null): string | null => {
    if (userProfiles.length === 0) return null;
    
    const activeIds = new Set([
      ...currentVisible.map(c => c.uid),
      ...(currentBacklog ? [currentBacklog.uid] : [])
    ]);

    const eligibleProfiles = userProfiles.filter(p => !activeIds.has(p.uid || p.id));
    
    if (eligibleProfiles.length > 0) {
      const randomIdx = Math.floor(Math.random() * eligibleProfiles.length);
      const chosen = eligibleProfiles[randomIdx];
      return chosen.uid || chosen.id || null;
    }

    // Fallback: if all used, allow recycling any from userProfiles
    const randomIdx = Math.floor(Math.random() * userProfiles.length);
    const chosen = userProfiles[randomIdx];
    return chosen.uid || chosen.id || null;
  };

  // Core Asynchronous database/API pre-fetching pipeline
  const prefetchNextCardAsync = async (
    currentVisible: UserProfileSimple[],
    currentBacklog: UserProfileSimple | null
  ) => {
    setIsFetchingBacklog(true);
    try {
      const nextId = getNextAvailableProfileId(currentVisible, currentBacklog);
      if (!nextId) {
        setIsFetchingBacklog(false);
        return;
      }

      // Fetch asynchronously from Firestore 'user_profiles' to simulate a real background fetch
      const docRef = doc(db, "user_profiles", nextId);
      const docSnap = await getDoc(docRef);

      let fetchedData: UserProfileSimple;
      if (docSnap.exists()) {
        const data = docSnap.data();
        fetchedData = mapToProfileCard({ uid: docSnap.id, ...data });
      } else {
        // Fallback to memory map if document doesn't exist yet
        const localProfile = userProfiles.find(p => (p.uid === nextId || p.id === nextId));
        fetchedData = mapToProfileCard(localProfile || { uid: nextId });
      }

      // Slight natural network delay to show the beautiful pipeline indicator in the backlog status
      await new Promise(resolve => setTimeout(resolve, 800));
      setBacklogCard(fetchedData);
    } catch (err) {
      console.warn("Pre-fetching error in background pipeline:", err);
      setError("Pipeline fetching issue");
    } finally {
      setIsFetchingBacklog(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (userProfiles.length === 0) return;

    // Set initial 3 visible cards from userProfiles or candidates
    const initialPool = userProfiles.slice(0, 5).map(mapToProfileCard);
    const visible = initialPool.slice(0, Math.min(3, initialPool.length));
    
    // Fill up if there are less than 3
    while (visible.length < 3 && userProfiles.length > 0) {
      const randomProfile = userProfiles[Math.floor(Math.random() * userProfiles.length)];
      visible.push(mapToProfileCard(randomProfile));
    }

    setVisibleCards(visible);

    // Initial pre-fetch of the backlog card
    const initialBacklogId = getNextAvailableProfileId(visible, null);
    if (initialBacklogId) {
      setIsFetchingBacklog(true);
      const docRef = doc(db, "user_profiles", initialBacklogId);
      getDoc(docRef).then((snap) => {
        if (snap.exists()) {
          setBacklogCard(mapToProfileCard({ uid: snap.id, ...snap.data() }));
        } else {
          const localProfile = userProfiles.find(p => (p.uid === initialBacklogId || p.id === initialBacklogId));
          setBacklogCard(mapToProfileCard(localProfile || { uid: initialBacklogId }));
        }
      }).catch((e) => {
        console.warn("Initial backlog fetch failed:", e);
      }).finally(() => {
        setIsFetchingBacklog(false);
      });
    }
  }, [userProfiles]);

  // Handle seamless cycle rotation
  const handleRotateNext = async () => {
    if (visibleCards.length === 0) return;

    // Reset auto-play timer on interaction
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
    }

    // Step 1: Slide foreground card out
    // Move visible cards state: remove first card, push backlog card to the end
    const exitedCard = visibleCards[0];
    const nextCards = [...visibleCards.slice(1)];

    if (backlogCard) {
      nextCards.push(backlogCard);
    } else {
      // Fallback if backlog hasn't loaded yet (safeguard)
      const fallbackId = getNextAvailableProfileId(visibleCards, null);
      if (fallbackId) {
        const fallbackProfile = userProfiles.find(p => (p.uid === fallbackId || p.id === fallbackId));
        nextCards.push(mapToProfileCard(fallbackProfile || { uid: fallbackId }));
      }
    }

    setVisibleCards(nextCards);
    setRotationCount(prev => prev + 1);

    // Clear backlog card slot to receive the next pre-fetch
    setBacklogCard(null);

    // Step 2: Trigger async pre-fetching for the NEXT backlog card in the background pipeline
    prefetchNextCardAsync(nextCards, null);

    // Restart auto-play if active
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
      handleRotateNext();
    }, 6000); // cycle every 6 seconds
  };

  useEffect(() => {
    if (isAutoPlaying && visibleCards.length > 0) {
      startAutoPlay();
    }
    return () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
    };
  }, [isAutoPlaying, visibleCards, backlogCard]);

  if (userProfiles.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-[200px] text-center border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950 p-6">
        <RefreshCw className="w-6 h-6 text-slate-300 dark:text-slate-600 animate-spin mb-3" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">[ Seeking Claimant Registries... ]</p>
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col items-center select-none pt-4 pb-2">
      
      {/* 3D Stack Container */}
      <div className="relative w-full max-w-[340px] sm:max-w-[360px] h-[175px] flex justify-center items-end pb-4">
        <AnimatePresence mode="popLayout">
          {visibleCards.map((profile, index) => {
            // Index 0: Foreground / Active Card
            // Index 1: Second Card / Stack Level 1
            // Index 2: Third Card / Stack Level 2

            // Visual transformation calculations for dynamic depth stacking
            const scale = 1 - index * 0.07;
            const yOffset = -index * 16;
            const opacity = 1 - index * 0.28;
            const zIndex = 30 - index * 10;

            const isForeground = index === 0;

            return (
              <motion.div
                key={profile.keyId}
                layout
                style={{ zIndex }}
                initial={
                  index === 2
                    ? { opacity: 0, scale: 0.7, y: -45 }
                    : { opacity, scale, y: yOffset }
                }
                animate={{
                  opacity,
                  scale,
                  y: yOffset,
                  transition: { type: "spring", stiffness: 350, damping: 28 }
                }}
                exit={{
                  x: -320,
                  rotate: -15,
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: 0.35, ease: "easeInOut" }
                }}
                className={`absolute w-full max-w-[320px] sm:max-w-[340px] bg-white dark:bg-slate-950 border ${
                  isForeground
                    ? "border-amber-500/50 shadow-lg shadow-amber-500/5 dark:shadow-amber-500/10"
                    : "border-slate-200 dark:border-slate-850 shadow-md"
                } rounded-2xl p-4 text-left flex flex-col justify-between h-[130px] cursor-pointer transition-colors duration-150`}
                onClick={() => {
                  if (isForeground) {
                    onViewProfile({
                      uid: profile.uid,
                      displayName: profile.displayName,
                      photoURL: profile.photoURL
                    });
                  } else {
                    // Clicking on background cards brings them to the front
                    handleRotateNext();
                  }
                }}
              >
                {/* Gold Crest Top Tag */}
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-1.5">
                    <Crown className={`w-3.5 h-3.5 ${isForeground ? "text-amber-500" : "text-slate-400"}`} />
                    <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Claimant {3 - index === 3 ? "Royal" : 3 - index === 2 ? "Nobility" : "Vanguard"}
                    </span>
                  </div>
                </div>

                {/* Profile Card Body */}
                <div className="flex items-start gap-3 mt-2 flex-1">
                  <img
                    src={profile.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
                    alt={profile.displayName}
                    className={`w-11 h-11 rounded-full object-cover border-2 ${
                      isForeground ? "border-amber-500" : "border-slate-300 dark:border-slate-800"
                    } shrink-0`}
                    onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName)}&background=random`; }}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-display font-black text-sm text-slate-800 dark:text-white truncate uppercase tracking-tight">
                      {profile.displayName}
                    </h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-2 mt-0.5 leading-relaxed font-medium">
                      {profile.bio}
                    </p>
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
