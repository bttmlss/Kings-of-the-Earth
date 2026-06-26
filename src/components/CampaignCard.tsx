import React, { useEffect, useState } from "react";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Users, ArrowUpRight } from "lucide-react";
import { Campaign, Candidate } from "../types";
import { motion } from "motion/react";

interface CampaignCardProps {
  key?: string;
  campaign: Campaign;
  onEnter: () => void;
}

export default function CampaignCard({ campaign, onEnter }: CampaignCardProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    // Fetch candidates list to show the competitor count (fetch once to save DB limits instead of realtime streams on all 30 cards)
    const fetchCandidates = async () => {
      try {
        const candidatesColRef = collection(db, "campaigns", campaign.id, "candidates");
        const q = query(candidatesColRef, orderBy("voteCount", "desc"));
        const snapshot = await getDocs(q);
        const list: Candidate[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ...d
          } as Candidate);
        });
        setCandidates(list);
      } catch (error) {
        console.warn("Failed fetching campaign candidates list:", error);
      }
    };
    
    fetchCandidates();
  }, [campaign.id]);

  return (
    <motion.div
      whileHover={{ y: -1, scale: 1.002, transition: { duration: 0.1 } }}
      onClick={onEnter}
      className="group relative bg-slate-100 dark:bg-slate-800/40 border border-slate-300 dark:border-slate-800 hover:border-amber-500/30 hover:bg-slate-200/65 dark:hover:bg-slate-800/70 rounded-xl p-3 sm:py-3 sm:px-4 shadow-xs transition-all overflow-hidden cursor-pointer flex items-center justify-between gap-4 w-full"
    >
      {/* Subtle indicator line */}
      <div className="absolute left-0 inset-y-0 w-1 bg-amber-500/10 group-hover:bg-amber-500/50 transition-colors" />

      {/* Domain details and contenders count */}
      <div className="flex-1 min-w-0 pr-2 pl-1.5">
        {campaign.domainType && (
          <span className="text-[8px] font-black uppercase tracking-wider text-amber-650 dark:text-amber-400 bg-amber-550/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 px-1 py-0.5 rounded-xs shrink-0 select-none">
            {campaign.domainType}
          </span>
        )}
        
        {/* Campaign Domain Name */}
        <h3 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight leading-tight mt-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
          {campaign.domainTitle}
        </h3>

        {/* Amount of contenders */}
        <div className="flex items-center gap-1.5 mt-1">
          <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {candidates.length}
            </span>{" "}
            {candidates.length === 1 ? "contender" : "contenders"}
          </span>
        </div>
      </div>

      {/* Enter indicator */}
      <div className="shrink-0 flex items-center gap-1.5 select-none mt-1">
        <span className="text-[9px] font-mono font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 group-hover:text-amber-500 transition-colors hidden sm:inline">
          ENTER
        </span>
        <div className="w-6.5 h-6.5 rounded-md bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:border-amber-500/30 group-hover:bg-amber-500/5 group-hover:text-amber-500 transition-all duration-150">
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  );
}

