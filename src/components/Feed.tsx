import React, { useState } from "react";
import { Search, HelpCircle } from "lucide-react";
import { motion } from "motion/react";
import { Campaign } from "../types";
import { User } from "firebase/auth";
import { getCampaignCategory } from "../utils";
import CampaignCard from "./CampaignCard";
import UserCard from "./UserCard";

interface FeedProps {
  campaigns: Campaign[];
  user: User;
  userProfiles: any[];
  recentVisits: any[];
  onSelectCampaign: (campaign: Campaign) => void;
  onViewProfile: (profile: { uid: string; displayName: string | null; photoURL?: string | null }) => void;
  theme: "light" | "dark" | any;
}

export default function Feed({
  campaigns,
  user,
  userProfiles,
  recentVisits,
  onSelectCampaign,
  onViewProfile,
  theme,
}: FeedProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "Cultures" | "locations" | "Objects" | "Actions" | "Miscellaneous" | "All"
  >("All");

  // Generated the displayed campaigns based on search and matching rules
  const displayedCampaigns = React.useMemo(() => {
    const categoryMatches = campaigns.filter((c) => {
      return selectedCategory === "All" || getCampaignCategory(c) === selectedCategory;
    });

    if (!searchQuery.trim()) {
      return categoryMatches;
    }

    return categoryMatches.filter((c) =>
      (c.domainTitle || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, campaigns, selectedCategory]);

  // Filter other users' profiles based on search query
  const filteredProfiles = React.useMemo(() => {
    return searchQuery.trim() && user
      ? userProfiles.filter((p) =>
          (p.displayName || "").toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [];
  }, [searchQuery, user, userProfiles]);

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-6 space-y-6 pb-20"
    >
      {/* Browse Categories & Search Group replacing the Kingdom Chronicles header */}
      <div className="max-w-lg mx-auto space-y-4">
        {/* Search Box */}
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="search_domains_no_native_autofill_id"
            name="search_domains_no_native_autofill_name"
            type="text"
            autoComplete="off"
            data-lpignore="true"
            data-1pignore="true"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            placeholder="Search domains, campaigns, or profiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-200 dark:bg-slate-800 border border-slate-400 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-amber-400 focus:bg-slate-100 dark:focus:bg-slate-900 focus:ring-4 focus:ring-amber-400/5 transition-all font-medium text-slate-800 dark:text-slate-100 animate-fade-in"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>

        {/* Domain Type Filter Boxes Grid (Only for Campaigns) */}
        {!searchQuery.trim() && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                Browse Domains by Domain Type
              </span>
              {selectedCategory !== "All" && (
                <button
                  onClick={() => setSelectedCategory("All")}
                  className="text-[10px] font-black text-amber-600 hover:text-amber-700 cursor-pointer leading-none"
                >
                  Reset Filter
                </button>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {(["Cultures", "locations", "Objects", "Actions", "Miscellaneous"] as const).map((cat) => {
                const isSelected = selectedCategory === cat;

                let icon = "🔮";
                if (cat === "Cultures") icon = "👥";
                else if (cat === "locations") icon = "📍";
                else if (cat === "Objects") icon = "📦";
                else if (cat === "Actions") icon = "⚡";

                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(isSelected ? "All" : cat)}
                    className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-center transition-all duration-150 cursor-pointer select-none ${
                      isSelected
                        ? "bg-amber-500 border-amber-600 text-slate-950 font-black shadow-md scale-[1.02]"
                        : "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span className="text-base mb-1">{icon}</span>
                    <span className="text-[9px] font-bold truncate w-full leading-none">
                      {cat}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Combined Search Results */}
      <div className="max-w-3xl mx-auto pb-10 space-y-8 animate-fade-in">
        {/* Recent Visits Section */}
        {!searchQuery.trim() && selectedCategory === "All" && recentVisits.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-1">Recently Visited</h3>
            <div className="flex flex-col gap-4">
              {recentVisits.map((visit, idx) => {
                if (visit.type === "campaign") {
                  const camp = campaigns.find((c) => c.id === visit.id) || visit.metadata;
                  if (!camp) return null;
                  return (
                    <React.Fragment key={`recent-${visit.type}-${visit.id}`}>
                      <CampaignCard campaign={camp} onEnter={() => onSelectCampaign(camp)} />
                      <hr className="border-t border-slate-200 dark:border-slate-800/80 my-1 w-full" />
                    </React.Fragment>
                  );
                } else {
                  const p = userProfiles.find((u) => u.uid === visit.id) || visit.metadata;
                  if (!p) return null;
                  return (
                    <React.Fragment key={`recent-${visit.type}-${visit.id}`}>
                      <UserCard
                        profile={p}
                        onEnter={() => {
                          onViewProfile({
                            uid: p.uid || p.id,
                            displayName: p.displayName,
                            photoURL: p.photoURL,
                          });
                        }}
                      />
                      <hr className="border-t border-slate-200 dark:border-slate-800/80 my-1 w-full" />
                    </React.Fragment>
                  );
                }
              })}
            </div>
          </div>
        )}

        {/* Profiles Section */}
        {searchQuery.trim() !== "" && filteredProfiles.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-1">Profiles</h3>
            <div className="flex flex-col gap-4" id="user-grid">
              {filteredProfiles.map((p, idx) => (
                <React.Fragment key={p.uid}>
                  <UserCard
                    profile={p}
                    onEnter={() => {
                      onViewProfile({
                        uid: p.uid,
                        displayName: p.displayName,
                        photoURL: p.photoURL,
                      });
                    }}
                  />
                  {idx !== filteredProfiles.length - 1 && (
                    <hr className="border-t border-slate-200 dark:border-slate-800/80 my-1 w-full" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Domains / Campaigns Section */}
        {displayedCampaigns.length === 0 ? (
          searchQuery.trim() !== "" && filteredProfiles.length === 0 ? (
            <div
              className="p-16 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl flex flex-col justify-center items-center gap-3 shadow-sm max-w-lg mx-auto"
              id="empty-search"
            >
              <HelpCircle className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <div className="text-slate-400 dark:text-slate-500 font-medium text-sm">
                No matching domains or profiles found.
              </div>
            </div>
          ) : null
        ) : (
          (searchQuery.trim() !== "" || selectedCategory !== "All") && (
            <div className="space-y-3">
              {searchQuery.trim() !== "" && (
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-1">Domains</h3>
              )}
              <div className="flex flex-col gap-4" id="campaign-grid">
                {displayedCampaigns.slice(0, 30).map((camp, idx) => (
                  <React.Fragment key={camp.id}>
                    <CampaignCard campaign={camp} onEnter={() => onSelectCampaign(camp)} />
                    {idx !== displayedCampaigns.slice(0, 30).length - 1 && (
                      <hr className="border-t border-slate-200 dark:border-slate-800/80 my-1 w-full" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )
        )}

        {/* Empty State when idle and no recent visits */}
        {!searchQuery.trim() && selectedCategory === "All" && recentVisits.length === 0 && (
          <div className="pt-20 text-center flex flex-col justify-center items-center gap-3 max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            </div>
            <div className="text-slate-400 dark:text-slate-500 font-medium text-sm mt-2">
              Search for domains, campaigns, or profiles.
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
