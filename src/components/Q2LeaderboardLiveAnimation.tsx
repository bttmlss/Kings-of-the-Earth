import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, Crown, ArrowUp, ArrowDown, Activity, Loader2 } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

interface RealClaimant {
  id: string;
  name: string;
  votes: number;
  bgGlow: string;
  avatar: string;
  photoURL: string | null;
}

export default function Q2LeaderboardLiveAnimation() {
  const [claimants, setClaimants] = useState<RealClaimant[]>([]);
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchRealStandings() {
      try {
        const campaignsSnap = await getDocs(collection(db, "campaigns"));
        if (!active) return;

        const campaignIdList: string[] = [];
        campaignsSnap.forEach((doc) => {
          const data = doc.data();
          if (data.status !== "taken_down") {
            campaignIdList.push(doc.id);
          }
        });

        const playerMap: Record<string, { userId: string; displayName: string; votes: number; photoURL: string | null }> = {};

        // Fetch user profiles to have actual/current profile images/names
        const userProfilesSnap = await getDocs(collection(db, "user_profiles"));
        const profilesMap: Record<string, { displayName?: string; photoURL?: string }> = {};
        if (active) {
          userProfilesSnap.forEach((docSnap) => {
            profilesMap[docSnap.id] = docSnap.data() as { displayName?: string; photoURL?: string };
          });
        }

        const promises = campaignIdList.map(async (campId) => {
          const candColRef = collection(db, "campaigns", campId, "candidates");
          const candSnapshot = await getDocs(candColRef);
          if (!active) return;

          candSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const userId = data.userId;
            if (!userId) return;
            const voteCount = data.voteCount || 0;
            const profile = profilesMap[userId];
            const currentName = profile?.displayName || data.displayName || "Unknown Claimant";
            const currentPhoto = profile?.photoURL || data.photoURL || null;

            if (!playerMap[userId]) {
              playerMap[userId] = {
                userId,
                displayName: currentName,
                votes: 0,
                photoURL: currentPhoto,
              };
            }
            playerMap[userId].votes += voteCount;
          });
        });

        await Promise.all(promises);
        if (!active) return;

        const sorted = Object.values(playerMap)
          .filter(item => item.votes > 0)
          .sort((a, b) => b.votes - a.votes)
          .slice(0, 3)
          .map((item, index) => {
            const defaultAvatars = ["👑", "🛡️", "⚡"];
            return {
              id: item.userId,
              name: item.displayName || "Unknown Claimant",
              votes: item.votes,
              avatar: defaultAvatars[index] || "👤",
              photoURL: item.photoURL,
              bgGlow: index === 0 ? "bg-amber-500/10" : index === 1 ? "bg-slate-400/10" : "bg-amber-700/10",
            };
          });

        setClaimants((prev) => {
          const currentRanks: Record<string, number> = {};
          prev.forEach((c, idx) => {
            currentRanks[c.id] = idx;
          });
          setPrevRanks(currentRanks);
          return sorted;
        });
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load real Q2 standings:", err);
        setIsLoading(false);
      }
    }

    fetchRealStandings();
    const interval = setInterval(fetchRealStandings, 12000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const maxVotes = Math.max(...claimants.map((c) => c.votes), 1);

  return (
    <div className="w-full h-full flex flex-col justify-between font-mono select-none px-1 py-1">
      {/* Small live action header inside cover */}
      <div className="flex items-center justify-between text-[6px] sm:text-[7px] text-slate-400 uppercase tracking-wider border-b border-slate-200/40 dark:border-slate-800/30 pb-1 mb-1">
        <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          LIVE LEDGER ACTIVE
        </span>
        <span className="flex items-center gap-0.5 text-amber-500 font-extrabold">
          <Activity className="w-2 h-2 text-amber-500 stroke-[2.5]" /> LIVE VELOCITY
        </span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center gap-1 text-[8px] text-slate-400 uppercase">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
          <span>Syncing Real Standings...</span>
        </div>
      ) : claimants.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[8px] text-slate-500 uppercase italic">
          [ no crown claimants registered ]
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center space-y-2 py-1">
          {claimants.map((c, index) => {
            const percentage = (c.votes / maxVotes) * 100;
            const originalIndex = prevRanks[c.id];
            const hasMovedUp = originalIndex !== undefined && index < originalIndex;
            const hasMovedDown = originalIndex !== undefined && index > originalIndex;

            return (
              <motion.div
                layout
                key={c.id}
                transition={{ type: "spring", stiffness: 180, damping: 20 }}
                className="flex items-center gap-2 text-[7.5px] sm:text-[8.5px]"
              >
                {/* Rank visual block */}
                <div className="w-4 text-center font-black flex items-center justify-center relative">
                  <span className={index === 0 ? "text-amber-500 font-black" : "text-slate-500"}>
                    #{index + 1}
                  </span>
                  
                  {/* Micro movement indicators */}
                  <AnimatePresence>
                    {hasMovedUp && (
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="absolute -right-0.5 -top-0.5"
                      >
                        <ArrowUp className="w-1.5 h-1.5 text-emerald-500 stroke-[4]" />
                      </motion.span>
                    )}
                    {hasMovedDown && (
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="absolute -right-0.5 -bottom-0.5"
                      >
                        <ArrowDown className="w-1.5 h-1.5 text-rose-500 stroke-[4]" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                {/* Avatar circle */}
                <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center rounded ${c.bgGlow} border border-slate-300 dark:border-slate-800 text-[6.5px] sm:text-[7.5px] overflow-hidden`}>
                  {c.photoURL ? (
                    <img src={c.photoURL || undefined} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    c.avatar
                  )}
                </div>

                {/* Name and Progress bar container */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex justify-between items-center text-[7px] sm:text-[8px] font-bold">
                    <span className="text-slate-700 dark:text-slate-300 truncate uppercase tracking-tight">{c.name}</span>
                    <span className={`${index === 0 ? "text-amber-500 font-black" : "text-slate-400"} shrink-0 font-mono scale-95`}>
                      {c.votes}V
                    </span>
                  </div>

                  {/* Micro progress trace */}
                  <div className="h-1 bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-300/40 dark:border-slate-800/40 relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ type: "tween", duration: 0.6, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${
                        index === 0
                          ? "from-amber-500 via-amber-400 to-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                          : index === 1
                          ? "from-slate-400 to-slate-250"
                          : "from-amber-800 to-amber-600"
                      }`}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
