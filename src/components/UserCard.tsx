import React from "react";
import { User as UserIcon, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  isPrivate?: boolean;
}

interface UserCardProps {
  profile: UserProfile;
  onEnter: () => void;
}

export default function UserCard({ profile, onEnter }: UserCardProps) {
  return (
    <motion.div
      whileHover={{ y: -1, scale: 1.002, transition: { duration: 0.1 } }}
      onClick={onEnter}
      className="group relative bg-slate-100 dark:bg-slate-800/40 border border-slate-300 dark:border-slate-800 hover:border-amber-500/30 hover:bg-slate-200/65 dark:hover:bg-slate-800/70 rounded-xl p-3 sm:py-3 sm:px-4 shadow-xs transition-all overflow-hidden cursor-pointer flex items-center justify-between gap-4 w-full"
    >
      {/* Subtle indicator line */}
      <div className="absolute left-0 inset-y-0 w-1 bg-amber-500/10 group-hover:bg-amber-500/50 transition-colors" />

      {/* User details */}
      <div className="flex-1 min-w-0 pr-2 pl-1.5 flex items-center gap-3">
        {profile.photoURL ? (
          <img
            src={profile.photoURL || undefined}
            alt=""
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover border border-amber-500/20 shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-slate-300 dark:border-slate-700 shrink-0">
            <UserIcon className="w-5 h-5 text-slate-500" />
          </div>
        )}
        <div>
          {profile.isPrivate ? (
            <span className="text-[8px] font-black uppercase tracking-wider text-amber-650 dark:text-amber-400 bg-amber-550/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 px-1 py-0.5 rounded-xs shrink-0 select-none">
              🔒 CLOAKED PROFILE
            </span>
          ) : null}
          <h3 className={`font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate ${profile.isPrivate ? "mt-1" : ""}`}>
            {profile.displayName}
          </h3>
        </div>
      </div>

      {/* Enter indicator */}
      <div className="shrink-0 flex items-center gap-1.5 select-none mt-1">
        <span className="text-[9px] font-mono font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 group-hover:text-amber-500 transition-colors hidden sm:inline">
          VIEW
        </span>
        <div className="w-6.5 h-6.5 rounded-md bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:border-amber-500/30 group-hover:bg-amber-500/5 group-hover:text-amber-500 transition-all duration-150">
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  );
}
