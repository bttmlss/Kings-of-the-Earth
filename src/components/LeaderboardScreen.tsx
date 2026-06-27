import React, { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, doc, setDoc, getDoc, updateDoc, increment } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { Campaign, Candidate } from "../types";
import { Trophy, Search, ArrowUp, ArrowDown, Minus, RefreshCw, PlaneTakeoff, Info, UserCircle, X } from "lucide-react";
import Logo from "./Logo";
import { motion, AnimatePresence } from "motion/react";

interface LeaderboardScreenProps {
  campaigns: Campaign[];
  currentUserId: string;
  onViewProfile?: (player: { uid: string; displayName: string; photoURL?: string | null }) => void;
  onModalToggle?: (isOpen: boolean) => void;
  focusUserId?: string;
}

interface AggregatedPlayer {
  userId: string;
  displayName: string;
  totalVotes: number;
  kingdomsContested: number;
  crownsHeld: number; // number of kingdoms where they have the highest vote count and > 0 votes
  bestKingdom: {
    domainTitle: string;
    voteCount: number;
  } | null;
  photoURL?: string | null;
  bio?: string;
  kingdoms: {
    domainTitle: string;
    voteCount: number;
    campaignId?: string;
    isLeader?: boolean;
  }[];
}

// Deterministic helper to assign stable locations based on userId
function getPlayerRegion(userId: string) {
  if (!userId) {
    return { continent: "North America", flag: "🌎", country: "United States" };
  }
  let sum = 0;
  for (let i = 0; i < userId.length; i++) {
    sum += userId.charCodeAt(i);
  }
  
  const continents = [
    { name: "North America", flag: "🌎", countries: ["United States", "Canada", "Mexico"] },
    { name: "Europe", flag: "🌍", countries: ["United Kingdom", "Germany", "France", "Italy"] },
    { name: "Asia-Pacific", flag: "🌏", countries: ["Japan", "South Korea", "Australia", "Singapore"] },
    { name: "Latin America", flag: "🌎", countries: ["Brazil", "Argentina", "Colombia"] }
  ];
  
  const continentObj = continents[sum % continents.length];
  const country = continentObj.countries[sum % continentObj.countries.length];
  
  return {
    continent: continentObj.name,
    flag: continentObj.flag,
    country: country
  };
}

// Helper to determine deterministic trend
function getPlayerTrend(userId: string, votes: number): "up" | "down" | "tied" {
  if (!userId) return "tied";
  let charSum = 0;
  for (let i = 0; i < userId.length; i++) {
    charSum += userId.charCodeAt(i);
  }
  const factor = (charSum + votes) % 3;
  if (factor === 0) return "up";
  if (factor === 1) return "down";
  return "tied";
}

function getOrdinalSuffix(num: number) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) {
    return num + "st";
  }
  if (j === 2 && k !== 12) {
    return num + "nd";
  }
  if (j === 3 && k !== 13) {
    return num + "rd";
  }
  return num + "th";
}

// Sleek Digital Character Block Component for a clean terminal look
function SplitFlapWord({ text, glow = "amber" }: { text: string; glow?: "amber" | "green" | "red" | "white" }) {
  const glowClasses = {
    amber: "text-amber-500 dark:text-amber-400 border-amber-900/30 bg-amber-500/5",
    green: "text-emerald-500 dark:text-emerald-400 border-emerald-900/30 bg-emerald-500/5",
    red: "text-rose-500 dark:text-rose-400 border-rose-900/30 bg-rose-500/5",
    white: "text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50",
  };

  const formattedText = text.toUpperCase();

  return (
    <div className="flex gap-[1px] select-none max-w-full overflow-hidden">
      {formattedText.split("").map((char, index) => (
        <span
          key={index}
          className={`relative inline-flex items-center justify-center border rounded-[3px] text-center font-mono font-bold w-[10px] h-[14px] sm:w-[12px] sm:h-[16px] text-[9px] sm:text-[10px] leading-none shadow-xs transition-colors ${glowClasses[glow]}`}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

export default function LeaderboardScreen({ campaigns, currentUserId, onViewProfile, onModalToggle, focusUserId }: LeaderboardScreenProps) {
  const [players, setPlayers] = useState<AggregatedPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState<"global" | "continental" | "national" | "kings">("global");
  const [selectedContinent, setSelectedContinent] = useState("North America");
  const [selectedCountry, setSelectedCountry] = useState("United States");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<AggregatedPlayer | null>(null);
  
  const handleSetSelectedPlayer = (player: AggregatedPlayer | null) => {
    setSelectedPlayer(player);
    onModalToggle?.(player !== null);
    
    // Log visit if it's a real player and not ourselves
    if (player && player.userId && player.userId !== currentUserId) {
      if (typeof window !== "undefined" && window.localStorage) {
        // Debounce / deduplicate visits per session using localStorage
        const visitKey = `visited_${player.userId}`;
        const lastVisit = localStorage.getItem(visitKey);
        const now = Date.now();
        if (!lastVisit || now - parseInt(lastVisit) > 1000 * 60 * 60) { // 1 hour cooldown
          localStorage.setItem(visitKey, now.toString());
          
          // Log directly via client SDK
          const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
          const dailyStatsRef = doc(db, `user_profiles/${player.userId}/daily_engagement`, today);
          
          setDoc(dailyStatsRef, {
            date: today,
            visits: increment(1)
          }, { merge: true }).catch(e => {
            console.error("Error logging visit", e);
          });
        }
      }
    }
  };

  // Sync initial selections with the current user's deterministic location
  useEffect(() => {
    if (currentUserId) {
      const region = getPlayerRegion(currentUserId);
      setSelectedContinent(region.continent);
      setSelectedCountry(region.country);
    }
  }, [currentUserId]);

  useEffect(() => {
    async function loadLeaderboardData() {
      setIsLoading(true);
      try {
        const playerMap: Record<string, AggregatedPlayer> = {};

        // Fetch user profiles to have actual/current profile images and bios
        const userProfilesSnap = await getDocs(collection(db, "user_profiles"));
        const profilesMap: Record<string, { displayName?: string; photoURL?: string; bio?: string }> = {};
        userProfilesSnap.forEach((docSnap) => {
          profilesMap[docSnap.id] = docSnap.data() as { displayName?: string; photoURL?: string; bio?: string };
        });

        // Fetch candidates for each active campaign
        const promises = campaigns.map(async (camp) => {
          const candColRef = collection(db, "campaigns", camp.id, "candidates");
          const q = query(candColRef, orderBy("voteCount", "desc"));
          const snapshot = await getDocs(q);

          const list: Candidate[] = [];
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as Candidate);
          });

          // Identify candidate with highest vote count
          const highestVotes = list.length > 0 ? list[0].voteCount : 0;

          list.forEach((cand) => {
            const isLeader = cand.voteCount === highestVotes && cand.voteCount > 0;
            const profile = profilesMap[cand.userId];
            let currentName = profile?.displayName || cand.displayName;
            if ((!currentName || currentName.toLowerCase().includes("unknown")) && cand.userId === currentUserId) {
              currentName = auth.currentUser?.displayName || cand.displayName;
            }
            let currentPhoto = profile?.photoURL !== undefined ? profile.photoURL : (cand.photoURL || null);
            if (!currentPhoto && cand.userId === currentUserId) {
              currentPhoto = auth.currentUser?.photoURL || null;
            }
            const currentBio = profile?.bio || cand.bio || "";

            if (!playerMap[cand.userId]) {
              playerMap[cand.userId] = {
                userId: cand.userId,
                displayName: currentName,
                photoURL: currentPhoto,
                bio: currentBio,
                totalVotes: 0,
                kingdomsContested: 0,
                crownsHeld: 0,
                bestKingdom: null,
                kingdoms: [],
              };
            } else {
              playerMap[cand.userId].displayName = currentName;
              playerMap[cand.userId].photoURL = currentPhoto;
              playerMap[cand.userId].bio = currentBio;
            }

            const p = playerMap[cand.userId];
            p.totalVotes += cand.voteCount;
            p.kingdomsContested += 1;
            if (isLeader) {
              p.crownsHeld += 1;
            }

            // Exclude empty campaigns or non-meaningful additions, but standard is fine
            p.kingdoms.push({
              domainTitle: camp.domainTitle,
              voteCount: cand.voteCount,
              campaignId: camp.id,
              isLeader: isLeader,
            });

            if (!p.bestKingdom || cand.voteCount > p.bestKingdom.voteCount) {
              p.bestKingdom = {
                domainTitle: camp.domainTitle,
                voteCount: cand.voteCount,
              };
            }
          });
        });

        await Promise.all(promises);

        // Convert map to array and sort by crowns held (primary) and then total votes (secondary)
        const sortedPlayers = Object.values(playerMap)
          .filter(p => p.totalVotes > 0)
          .sort((a, b) => {
          if (b.crownsHeld !== a.crownsHeld) {
            return b.crownsHeld - a.crownsHeld;
          }
          return b.totalVotes - a.totalVotes;
        });

        setPlayers(sortedPlayers);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Error loading global leaderboard details:", err);
        handleFirestoreError(err, OperationType.GET, "user_profiles");
      } finally {
        setIsLoading(false);
      }
    }

    loadLeaderboardData();
  }, [campaigns]);

  // Compute processed, filtered, and dynamically aggregated players based on search query
  const processedPlayers = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return players;
    }

    const tokens = query.split(/\s+/).filter(Boolean);

    // 1. Identify which campaigns match the search tokens
    const matchedCampaigns = campaigns.filter((camp) => {
      const title = (camp.domainTitle || "").toLowerCase();
      const cid = (camp.id || "").toLowerCase();
      return tokens.some((t) => title.includes(t) || cid.includes(t) || t.includes(title) || t.includes(cid));
    });

    const isCampaignSearch = matchedCampaigns.length > 0;

    let personQuery = query;
    if (isCampaignSearch) {
      // Screen out tokens that correspond to the matched campaigns
      const campaignTokenSet = new Set<string>();
      matchedCampaigns.forEach((c) => {
        const titleTokens = (c.domainTitle || "").toLowerCase().split(/[\s.]+/);
        titleTokens.forEach((t) => campaignTokenSet.add(t));
        campaignTokenSet.add(c.id.toLowerCase());
      });

      personQuery = tokens
        .filter((t) => !campaignTokenSet.has(t) && !campaignTokenSet.has(t.replace(/\.(com|org|net|io|edu|gov)$/i, "")))
        .join(" ");
    }

    let result: AggregatedPlayer[] = [];

    if (isCampaignSearch) {
      const matchedCampIds = new Set(matchedCampaigns.map((c) => c.id));
      players.forEach((p) => {
        const relevantKingdoms = p.kingdoms.filter((k) => k.campaignId && matchedCampIds.has(k.campaignId));
        if (relevantKingdoms.length > 0) {
          // Re-calculate stats targeting ONLY matched campaigns!
          const tempTotalVotes = relevantKingdoms.reduce((sum, k) => sum + k.voteCount, 0);
          const tempCrownsHeld = relevantKingdoms.filter((k) => k.isLeader).length;

          let tempBestKingdom = p.bestKingdom;
          const bestOfRelevant = relevantKingdoms.reduce((best, k) => {
            if (!best || k.voteCount > best.voteCount) {
              return { domainTitle: k.domainTitle, voteCount: k.voteCount };
            }
            return best;
          }, null as { domainTitle: string; voteCount: number } | null);

          if (bestOfRelevant) {
            tempBestKingdom = bestOfRelevant;
          }

          if (tempTotalVotes > 0) {
            result.push({
              ...p,
              totalVotes: tempTotalVotes,
              crownsHeld: tempCrownsHeld,
              kingdomsContested: relevantKingdoms.length,
              bestKingdom: tempBestKingdom,
            });
          }
        }
      });
    } else {
      result = players;
    }

    if (personQuery.trim()) {
      const pQuery = personQuery.trim().toLowerCase();
      result = result.filter((p) =>
        p.displayName.toLowerCase().includes(pQuery) ||
        (p.bio && p.bio.toLowerCase().includes(pQuery))
      );
    }

    // Sort by crowns held, then total votes in search scope
    return [...result].sort((a, b) => {
      if (b.crownsHeld !== a.crownsHeld) {
        return b.crownsHeld - a.crownsHeld;
      }
      return b.totalVotes - a.totalVotes;
    });
  }, [players, searchQuery, campaigns]);

  // 1. First segment the players by geographical scope (on top of processed search results)
  const scopedPlayers = processedPlayers.filter((p) => {
    if (scope === "kings") {
      return campaigns.some((c) => (c as any).currentKingId === p.userId);
    }
    const region = getPlayerRegion(p.userId);
    if (scope === "continental") {
      return region.continent === selectedContinent;
    }
    if (scope === "national") {
      return region.country === selectedCountry;
    }
    return true; // global
  });

  // 2. Already filtered at the search and geographical scope level
  const filteredPlayers = scopedPlayers;

  // 3. Track original ranks and slice to a 10-player window around the focused user if requested
  const rankedPlayers = filteredPlayers.map((player, index) => ({
    player,
    rank: index + 1,
  }));

  let displayedRankedPlayers = rankedPlayers;

  if (focusUserId) {
    const targetIndex = rankedPlayers.findIndex((rp) => rp.player.userId === focusUserId);
    if (targetIndex !== -1) {
      let startIdx = targetIndex - 4;
      if (startIdx < 0) startIdx = 0;
      let endIdx = startIdx + 10;
      if (endIdx > rankedPlayers.length) {
        endIdx = rankedPlayers.length;
        startIdx = Math.max(0, endIdx - 10);
      }
      displayedRankedPlayers = rankedPlayers.slice(startIdx, endIdx);
    } else {
      displayedRankedPlayers = rankedPlayers.slice(0, 10);
    }
  } else {
    displayedRankedPlayers = rankedPlayers.slice(0, 100);
  }

  const currentUserRegion = getPlayerRegion(currentUserId);
  const userScopedIndex = scopedPlayers.findIndex((p) => p.userId === currentUserId);
  const userRank = userScopedIndex !== -1 ? userScopedIndex + 1 : null;
  const totalScoped = scopedPlayers.length;

  return (
    <div className="px-4 py-2 space-y-3.5 max-w-4xl mx-auto font-sans text-slate-800 dark:text-slate-100">
      {/* Sleek Minimalist Title and Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
        <h2 className="font-display font-black text-2xl tracking-widest text-slate-900 dark:text-slate-100 uppercase flex items-center gap-2.5">
          <Trophy className="w-5.5 h-5.5 text-amber-500" />
          leaderboards
        </h2>

        {/* Search Bar */}
        <div className="relative w-full sm:max-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            id="search-leaderboard"
            type="text"
            placeholder="SEARCH DOMAIN OR PLAYER..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-[#07080a] border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono tracking-widest text-amber-600 dark:text-amber-400 focus:outline-none focus:border-amber-500 placeholder:text-slate-400 dark:placeholder:text-slate-700 transition-all uppercase"
          />
        </div>
      </div>

      {/* Scope Segment Switcher */}
      <div className="flex bg-slate-200/50 dark:bg-[#07080a] border border-slate-300 dark:border-slate-800/60 p-1 rounded-2xl max-w-lg shadow-inner">
        <button
          onClick={() => {
            setScope("global");
            setSearchQuery("");
          }}
          className={`flex-1 py-1.5 text-center text-[10px] font-mono font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer ${
            scope === "global"
              ? "bg-white dark:bg-[#181a20] text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200 dark:border-slate-800"
              : "text-slate-555 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          GLOBAL
        </button>
        <button
          onClick={() => {
            setScope("continental");
            setSearchQuery("");
            const region = getPlayerRegion(currentUserId);
            setSelectedContinent(region.continent);
          }}
          className={`flex-1 py-1.5 text-center text-[10px] font-mono font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer ${
            scope === "continental"
              ? "bg-white dark:bg-[#181a20] text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200 dark:border-slate-800"
              : "text-slate-555 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          CONTINENTAL
        </button>
        <button
          onClick={() => {
            setScope("national");
            setSearchQuery("");
            const region = getPlayerRegion(currentUserId);
            setSelectedCountry(region.country);
          }}
          className={`flex-1 py-1.5 text-center text-[10px] font-mono font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer ${
            scope === "national"
              ? "bg-white dark:bg-[#181a20] text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200 dark:border-slate-800"
              : "text-slate-555 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          NATIONAL
        </button>
        <button
          onClick={() => {
            setScope("kings");
            setSearchQuery("");
          }}
          className={`flex-1 py-1.5 text-center text-[10px] font-mono font-extrabold uppercase tracking-widest rounded-xl transition-all cursor-pointer ${
            scope === "kings"
              ? "bg-white dark:bg-[#181a20] text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200 dark:border-slate-800"
              : "text-slate-555 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          KINGS ONLY
        </button>
      </div>

      {/* Secondary Continental Segment Filter */}
      <AnimatePresence mode="wait">
        {scope === "continental" && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-row overflow-x-auto whitespace-nowrap gap-2 pb-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent snap-x"
          >
            {["North America", "Europe", "Asia-Pacific", "Latin America"].map((cName) => {
              const count = players.filter((p) => getPlayerRegion(p.userId).continent === cName).length;
              const isUserContinent = currentUserRegion.continent === cName;
              return (
                <button
                  key={cName}
                  onClick={() => setSelectedContinent(cName)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer border ${
                    selectedContinent === cName
                      ? "bg-white dark:bg-[#1a1d24] text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs"
                      : "bg-slate-200/50 dark:bg-[#08090d] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-850 hover:bg-slate-300/40 dark:hover:bg-slate-900"
                  }`}
                >
                  <span>{cName}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-md font-mono ${
                      selectedContinent === cName ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-slate-300/50 dark:bg-slate-900 text-slate-500 dark:text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                  {isUserContinent && (
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1 py-0.2 rounded font-extrabold">
                      YOURS
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}

        {/* Secondary National Segment Filter */}
        {scope === "national" && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-row overflow-x-auto whitespace-nowrap gap-2 pb-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent snap-x"
          >
            {["United States", "Canada", "Mexico", "United Kingdom", "Germany", "France", "Italy", "Japan", "South Korea", "Australia", "Singapore", "Brazil", "Argentina", "Colombia"].map((cName) => {
              const count = players.filter((p) => getPlayerRegion(p.userId).country === cName).length;
              const isUserCountry = currentUserRegion.country === cName;

              return (
                <button
                  key={cName}
                  onClick={() => setSelectedCountry(cName)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer border ${
                    selectedCountry === cName
                      ? "bg-white dark:bg-[#1a1d24] text-amber-600 dark:text-amber-400 border-amber-500/40 shadow-xs"
                      : "bg-slate-200/50 dark:bg-[#08090d] text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-850 hover:bg-slate-300/40 dark:hover:bg-slate-900"
                  }`}
                >
                  <span>{cName}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-md font-mono ${
                      selectedCountry === cName ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-slate-300/50 dark:bg-slate-900 text-slate-500 dark:text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                  {isUserCountry && (
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1 py-0.2 rounded font-extrabold">
                      YOURS
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>



      {/* Custom Scored Standings Spreadsheet-Style Grid Table */}
      <div className="border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#07080a] overflow-hidden shadow-sm relative font-mono select-none rounded-[20px]">
        {isLoading ? (
          <div className="p-20 flex flex-col justify-center items-center gap-4">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <span className="text-xs font-mono font-bold tracking-widest text-slate-700 dark:text-amber-400 uppercase animate-pulse">
              SYNCING LEADERBOARDS...
            </span>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="p-16 text-center text-slate-500 dark:text-slate-400 text-xs tracking-wider uppercase border-t border-slate-200 dark:border-slate-800">
            [ NO DISTINCT MATCHING CLAIMANTS ON THE BOARD ]
          </div>
        ) : (
          <div className="w-full">
            {/* Table Header Row (Spreadsheet Header Line) */}
            <div className="grid grid-cols-12 bg-slate-200/85 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 text-[9px] font-mono font-black text-slate-550 dark:text-slate-400 uppercase tracking-widest divide-x divide-slate-300 dark:divide-slate-800">
              <div className="col-span-2 py-1.5 text-center flex items-center justify-center font-bold">RANK</div>
              <div className="col-span-1 py-1.5 text-center flex items-center justify-center font-bold">CREST</div>
              <div className="col-span-5 py-1.5 px-3 text-left flex items-center font-bold">CLAIMANT ID</div>
              <div className="col-span-2 py-1.5 text-center flex items-center justify-center font-bold">VOTES</div>
              <div className="col-span-2 py-1.5 text-center flex items-center justify-center font-bold">TREND</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-[#07080a] animate-fade-in">
              {displayedRankedPlayers.map(({ player: p, rank: rankNum }) => {
                const isCurrentUser = p.userId === currentUserId;
                const paddedRank = rankNum < 10 ? `0${rankNum}` : `${rankNum}`;
                const trend = getPlayerTrend(p.userId, p.totalVotes);

                // Safe truncate of username to fit beautifully inside the terminal grid blocks
                const cleanName = p.displayName.trim().slice(0, 10).toUpperCase();
                const paddedName = cleanName.padEnd(10, " ");
                
                // Format vote count to 4 digits (e.g. 0014, 0250)
                const voteString = String(p.totalVotes || 0).padStart(4, "0");

                return (
                  <div
                    key={p.userId}
                    className={`grid grid-cols-12 transition-colors duration-100 divide-x divide-slate-200 dark:divide-slate-800 items-center hover:bg-slate-200/50 dark:hover:bg-slate-900/40 relative ${
                      isCurrentUser
                        ? "bg-amber-500/5 dark:bg-[#09100d]/40 text-emerald-600 dark:text-emerald-400 font-extrabold shadow-[inset_0_0_12px_rgba(16,185,129,0.06)]"
                        : "bg-white dark:bg-transparent"
                    }`}
                  >
                    {isCurrentUser && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-emerald-500 z-10" />
                    )}

                    {/* Rank cell */}
                    <div className="col-span-2 py-1.5 flex justify-center">
                      <SplitFlapWord text={`#${paddedRank}`} glow={isCurrentUser ? "green" : (rankNum === 1 ? "green" : "amber")} />
                    </div>

                    {/* Crest cell */}
                    <div 
                      className="col-span-1 py-1 flex justify-center items-center cursor-pointer group/crest relative"
                      onClick={() => {
                        if (onViewProfile) {
                          onViewProfile({ uid: p.userId, displayName: p.displayName, photoURL: p.photoURL });
                        } else {
                          handleSetSelectedPlayer(p);
                        }
                      }}
                      title={`View ${p.displayName}'s Royal Profile`}
                    >
                      {p.photoURL ? (
                        <img
                          src={p.photoURL || undefined}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-5.5 h-5.5 rounded-md object-cover ring-1 ring-amber-500/25 shrink-0 group-hover/crest:scale-110 active:group-hover/crest:scale-95 transition-all duration-150 group-hover/crest:ring-amber-400"
                        />
                      ) : (
                        <div className="w-5.5 h-5.5 rounded-md bg-slate-300/70 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 ring-1 ring-slate-400/20 shrink-0 group-hover/crest:scale-110 active:group-hover/crest:scale-95 transition-all duration-150 group-hover/crest:ring-amber-500/40">
                          <UserCircle className="w-4 h-4 text-slate-400 group-hover/crest:text-amber-500 stroke-[1.25] transition-colors" />
                        </div>
                      )}
                    </div>

                    {/* Claimant Name cell */}
                    <div 
                      className="col-span-5 py-1.5 px-3 flex items-center min-w-0 cursor-pointer hover:opacity-85"
                      onClick={() => {
                        if (onViewProfile) {
                          onViewProfile({ uid: p.userId, displayName: p.displayName, photoURL: p.photoURL });
                        } else {
                          handleSetSelectedPlayer(p);
                        }
                      }}
                      title={`View ${p.displayName}'s Royal Profile`}
                    >
                      <SplitFlapWord text={paddedName} glow={isCurrentUser ? "green" : "white"} />
                    </div>

                    {/* Votes cell */}
                    <div className="col-span-2 py-1.5 flex justify-center">
                      <SplitFlapWord text={voteString} glow={isCurrentUser ? "green" : (p.totalVotes > 0 ? "amber" : "white")} />
                    </div>

                    {/* Trend cell */}
                    <div className="col-span-2 py-1.5 flex justify-center items-center text-center">
                      {trend === "up" ? (
                        <ArrowUp className="w-3 h-3 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
                      ) : trend === "down" ? (
                        <ArrowDown className="w-3 h-3 text-rose-500 dark:text-rose-400 stroke-[3]" />
                      ) : (
                        <Minus className="w-3 h-3 text-slate-500 dark:text-slate-400 stroke-[2.5]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Profile Detail Pop-up Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-100 dark:bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 shadow-xl max-w-sm w-full relative overflow-hidden font-sans"
            >
              {/* Retro line pattern background */}
              <div className="absolute inset-0 bg-linear-to-b from-amber-500/0 via-amber-500/0 to-amber-500/3 pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => handleSetSelectedPlayer(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-500 hover:text-amber-500 transition-colors" />
              </button>

              <div className="flex flex-col items-center text-center space-y-4">
                {/* Crest / Picture */}
                <div className="relative mt-2">
                  {selectedPlayer.photoURL ? (
                    <img
                      src={selectedPlayer.photoURL || undefined}
                      alt={selectedPlayer.displayName}
                      referrerPolicy="no-referrer"
                      className="w-18 h-18 rounded-2xl object-cover ring-2 ring-amber-500/40 shadow-md"
                    />
                  ) : (
                    <div className="w-18 h-18 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 ring-2 ring-slate-400/20 shadow-md">
                      <UserCircle className="w-12 h-12 text-slate-400" />
                    </div>
                  )}
                  {/* Absolute Badge */}
                  <div className="absolute -bottom-2 -right-2 bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider shadow-xs">
                    CLAIMANT
                  </div>
                </div>

                {/* Display Name / Title */}
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-950 dark:text-white tracking-tight leading-tight uppercase select-all">
                    {selectedPlayer.displayName}
                  </h3>
                  <div className="flex items-center justify-center gap-1 mt-1 text-[9px] font-mono text-slate-400 font-bold uppercase tracking-widest">
                    <span>ID:</span>
                    <span className="text-slate-600 dark:text-slate-300 select-all">{selectedPlayer.userId.slice(0, 12)}...</span>
                  </div>
                </div>

                {/* Regional Territory */}
                {(() => {
                  const reg = getPlayerRegion(selectedPlayer.userId);
                  return (
                    <div className="flex items-center gap-1.5 bg-slate-200/55 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/80 px-3 py-1 rounded-full text-xs text-slate-600 dark:text-slate-300 font-medium">
                      <span>{reg.flag}</span>
                      <span>{reg.country}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 ">{reg.continent}</span>
                    </div>
                  );
                })()}

                {/* Divider */}
                <div className="w-full h-[1px] bg-slate-300 dark:bg-slate-800" />

                {/* Proclamation / Bio */}
                <div className="w-full text-left space-y-1">
                  <span className="text-[9px] font-mono font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest leading-none">
                    ROYAL PROCLAMATION:
                  </span>
                  {selectedPlayer.bio ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic select-text break-words bg-slate-200/20 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-300 dark:border-slate-800/80 leading-normal">
                      “{selectedPlayer.bio}”
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 italic bg-slate-200/10 dark:bg-slate-950 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 leading-normal">
                      No proclamation declared by this sovereign yet.
                    </p>
                  )}
                </div>

                {/* Stats Ledger */}
                <div className="w-full bg-slate-200/40 dark:bg-slate-950/20 border border-slate-300/60 dark:border-slate-800/80 rounded-2xl p-3 grid grid-cols-3 divide-x divide-slate-300 dark:divide-slate-800 font-mono text-center">
                  <div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">CROWNS</p>
                    <p className="text-sm font-extrabold text-amber-500 mt-1 flex items-center justify-center gap-0.5 select-all">
                      <Logo className="w-3 h-3 fill-amber-500/25 shrink-0" />
                      {selectedPlayer.crownsHeld}
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">VOTES</p>
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1 select-all">
                      {selectedPlayer.totalVotes}
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">CONTESTS</p>
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1 select-all">
                      {selectedPlayer.kingdomsContested}
                    </p>
                  </div>
                </div>

                {/* Best Kingdom display */}
                {selectedPlayer.bestKingdom && (
                  <div className="w-full text-left space-y-1 bg-amber-500/5 border border-amber-500/15 p-2.5 rounded-xl text-xs">
                    <div className="flex items-center gap-1 text-[8px] font-mono font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                      <Trophy className="w-2.5 h-2.5 text-amber-500" />
                      PRIMARY REALM:
                    </div>
                    <div className="flex justify-between items-center text-slate-700 dark:text-amber-200 font-medium">
                      <span className="truncate pr-2 font-display uppercase font-bold tracking-tight text-[11px] select-all">{selectedPlayer.bestKingdom.domainTitle}</span>
                      <span className="font-mono text-[9px] text-amber-500 font-bold shrink-0 select-all">{selectedPlayer.bestKingdom.voteCount} votes</span>
                    </div>
                  </div>
                )}

                {/* All Contested Realms display */}
                {selectedPlayer.kingdoms && selectedPlayer.kingdoms.length > 0 && (
                  <div className="w-full text-left space-y-1 bg-slate-200/20 dark:bg-[#050609] p-3 rounded-2xl border border-slate-300 dark:border-slate-800 text-xs">
                    <div className="text-[8px] font-mono font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1.5">
                      CONTESTED REALMS ({selectedPlayer.kingdoms.length})
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1 divide-y divide-slate-200/50 dark:divide-slate-800 pr-1 scrollbar-thin">
                      {selectedPlayer.kingdoms.map((k, kIdx) => (
                        <div key={kIdx} className="flex justify-between items-center text-[10px] py-1 first:pt-0 last:pb-0 text-slate-700 dark:text-slate-300 uppercase">
                          <span className="truncate font-bold tracking-tight pr-2 select-all">{k.domainTitle}</span>
                          <span className="font-mono text-[9px] text-indigo-400 font-bold shrink-0 select-all">{k.voteCount} votes</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
