import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  doc,
  query,
  onSnapshot,
  orderBy,
  updateDoc,
  setDoc,
  getDoc,
  increment,
  deleteDoc,
  serverTimestamp,
  where,
  runTransaction,
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Crown, Users, ArrowLeft, Plus, Sparkles, AlertCircle, CircleUser, Vote, ShieldCheck, Trash2, ArrowUp, ArrowDown, FolderTree, Minus, Trophy, Award, LogOut, Image as ImageIcon } from "lucide-react";
import { Campaign, Candidate, VoteLog } from "../types";
import { getCampaignCategory } from "../utils";
import { useLocationPing } from "../contexts/LocationContext";
import { motion, AnimatePresence } from "motion/react";
import KingdomCourtBuilder from "./KingdomCourtBuilder";
import CampaignFeed from "./CampaignFeed";
import CreatePostModal from "./CreatePostModal";
import CandidateCampaignScreen from "./CandidateCampaignScreen";

function RandomCampaignSlider({ candidates, setSelectedCandidate }: { candidates: any[], setSelectedCandidate: (c: any) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (candidates.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        let nextIndex;
        do {
          nextIndex = Math.floor(Math.random() * candidates.length);
        } while (nextIndex === prev);
        return nextIndex;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [candidates.length]);

  if (candidates.length === 0) {
    return (
      <div className="text-center py-4 text-xs font-mono text-slate-400 uppercase">
        [ No other active campaigns available ]
      </div>
    );
  }

  const c = candidates[currentIndex];

  return (
    <div className="relative w-full h-[90px] overflow-hidden rounded-xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={c.id || c.userId || currentIndex}
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full"
        >
          <div
            onClick={() => setSelectedCandidate(c)}
            className="w-full h-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl hover:border-amber-500/50 transition-all text-left space-y-2 group cursor-pointer flex flex-col justify-center shadow-sm"
          >
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                 <Crown className="w-3.5 h-3.5" /> CAMPAIGN
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-300 font-mono font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {c.voteCount} VOTES
              </span>
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-amber-500 transition-colors uppercase">
                {c.campaignTitle || `${c.displayName}'s Campaign`}
              </h4>
              <p className="text-[10px] text-slate-400 truncate uppercase mt-0.5 font-medium tracking-wider">
                {c.isKing ? "CURRENT LEADER" : `CANDIDATE • ${c.displayName}`}
              </p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

interface CampaignDetailProps {
  campaign: Campaign;
  userId: string;
  userName: string;
  userPhotoURL?: string | null;
  userProfiles?: any[];
  onBack: () => void;
  onViewProfile?: (user: { uid: string; displayName: string; photoURL: string | null }) => void;
  campaigns?: Campaign[];
  onSelectCampaign?: (campaign: Campaign) => void;
  initialSelectedCandidateUserId?: string | null;
}

interface FloatingEffect {
  id: number;
  candidateId: string;
  x: number;
  y: number;
}

// Deterministic helper to assign stable locations based on userId
function getPlayerTrend(userId: string, votes: number): "up" | "down" | "tied" {
  if (!userId) return "tied";
  let sum = 0;
  for (let i = 0; i < userId.length; i++) {
    sum += userId.charCodeAt(i);
  }
  const factor = (sum + votes) % 3;
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

export default function CampaignDetail({
  campaign,
  userId,
  userName,
  userPhotoURL,
  userProfiles = [],
  onBack,
  onViewProfile,
  campaigns = [],
  onSelectCampaign,
  initialSelectedCandidateUserId,
}: CampaignDetailProps) {
  const { currentCity, latitude, longitude, lastPingAt, pingError, forcePing } = useLocationPing();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(true);
  const [userJoined, setUserJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCastingVote, setIsCastingVote] = useState<string | null>(null);
  const [floatingEffects, setFloatingEffects] = useState<FloatingEffect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedCandidateId, setVotedCandidateId] = useState<string | null>(null);
  const [selectedBallotCandidate, setSelectedBallotCandidate] = useState<string>("");
  const [isLeaving, setIsLeaving] = useState(false);
  const [showOptInPrompt, setShowOptInPrompt] = useState(false);
  const [showQuitPrompt, setShowQuitPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "court">("leaderboard");
  const containerRef = useRef<HTMLDivElement>(null);

  const [creatorCourt, setCreatorCourt] = useState<any | null>(null);
  const [showAllCampaignsPage, setShowAllCampaignsPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [initialSelectDone, setInitialSelectDone] = useState(false);

  const isGuest = userId.startsWith("local_");

  // Auto-select candidate from profile view
  useEffect(() => {
    if (initialSelectedCandidateUserId && candidates.length > 0 && !initialSelectDone) {
      const targetCand = candidates.find(c => c.userId === initialSelectedCandidateUserId);
      if (targetCand) {
        setSelectedCandidate(targetCand);
      }
      setInitialSelectDone(true);
    } else if (!initialSelectedCandidateUserId) {
      setInitialSelectDone(true);
    }
  }, [initialSelectedCandidateUserId, candidates, initialSelectDone]);

  // Reset resolution states when campaign or target candidate changes
  useEffect(() => {
    setSelectedCandidate(null);
    setInitialSelectDone(false);
  }, [campaign.id, initialSelectedCandidateUserId]);

  // Track recent visits
  useEffect(() => {
    if (!campaign?.id || !userId) return;
    
    // Log campaign visit for the campaign creator
    if (campaign.creatorId && campaign.creatorId !== auth.currentUser?.uid) {
      auth.currentUser?.getIdToken().then(token => {
        fetch("/api/log-campaign-visit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ targetUserId: campaign.creatorId })
        }).catch(err => console.error("Failed to log campaign visit", err));
      }).catch(() => {});
    }
    
    const key = `recent_campaigns_${userId}`;
    try {
      const stored = localStorage.getItem(key);
      let recent = stored ? JSON.parse(stored) : [];
      
      // Remove if already exists to push to front
      recent = recent.filter((id: string) => id !== campaign.id);
      
      // Add to front
      recent.unshift(campaign.id);
      
      // Keep only last 10
      if (recent.length > 10) {
        recent = recent.slice(0, 10);
      }
      
      localStorage.setItem(key, JSON.stringify(recent));
    } catch (e) {
      console.warn("Failed to track recent campaign visit", e);
    }
  }, [campaign.id, userId]);

  const scrollTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Hide body scrollbar when this component is mounted to prevent double-scrollbars
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const executeLeave = async () => {
    setIsLeaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const leaveRes = await fetch("/api/leave-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id
        })
      });

      if (!leaveRes.ok) {
        const data = await leaveRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to leave campaign");
      }
    } catch (err: any) {
      console.error("Failed to leave campaign:", err);
      setError("Failed to forfeit your position in this campaign. Please try again.");
    } finally {
      setIsLeaving(false);
    }
  };

  const userCandidateIndex = candidates.findIndex((c) => c.userId === userId);
  const userDetailRank = userCandidateIndex !== -1 ? userCandidateIndex + 1 : null;
  const totalCandidates = candidates.length;

  // Reset scroll to top instantly when campaign changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo(0, 0);
    }
  }, [campaign.id]);

  // Listen to creator's court (pedigree)
  useEffect(() => {
    if (!campaign?.id || !campaign?.creatorId) return;
    const courtDocRef = doc(db, "campaigns", campaign.id, "courts", campaign.creatorId);
    const unsubscribe = onSnapshot(courtDocRef, (snap) => {
      if (snap.exists()) {
        setCreatorCourt(snap.data());
      } else {
        setCreatorCourt(null);
      }
    }, (err) => {
      console.error("Error streaming creator court in campaign detail:", err);
    });
    return () => unsubscribe();
  }, [campaign.id, campaign.creatorId]);

  const isUserInPedigree = userId === campaign.creatorId || (creatorCourt?.members || []).some((m: any) => m.userId === userId);

  const cleanedDetailTitle = campaign.domainTitle || "";

  // Monitor user's vote under this campaign
  useEffect(() => {
    const isFrozen = campaign.isFrozen;
    if (isFrozen) {
      setHasVoted(false);
      setVotedCandidateId(null);
      return;
    }

    const votesColRef = collection(db, "campaigns", campaign.id, "votes");
    const q = query(votesColRef, where("voterId", "==", userId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          setHasVoted(true);
          const docSnap = snapshot.docs[0];
          setVotedCandidateId(docSnap.data().candidateId || null);
        } else {
          setHasVoted(false);
          setVotedCandidateId(null);
        }
      },
      (error) => {
        console.warn("Snapshot subscription failed for user campaign vote status:", error);
      }
    );

    return () => unsubscribe();
  }, [campaign.id, userId, campaign.domainTitle]);

  // Monitor live streaming of candidates in this campaign
  useEffect(() => {
    const candidatesColRef = collection(db, "campaigns", campaign.id, "candidates");
    const q = query(candidatesColRef, orderBy("voteCount", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Candidate[] = [];
        let joined = false;
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const candidate = {
            id: docSnap.id,
            ...d
          } as Candidate;
          list.push(candidate);
          if (candidate.userId === userId) {
            joined = true;
          }
        });
        setCandidates(list);
        setUserJoined(joined);
        setIsCandidatesLoading(false);
        
        // Suggest first candidate who is NOT the user themselves
        const eligible = list.filter((c) => c.userId !== userId);
        if (eligible.length > 0) {
          setSelectedBallotCandidate((prev) => {
            const stillEligible = eligible.some((e) => e.id === prev);
            return stillEligible ? prev : eligible[0].id;
          });
        } else {
          setSelectedBallotCandidate("");
        }
      },
      (error) => {
        console.warn("Snapshot subscription failed for campaign detail candidates list:", error);
        setIsCandidatesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [campaign.id, userId]);

  // Handle joining as a competitor (execute join after confirmation)
  const executeJoin = async () => {
    setIsJoining(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const joinRes = await fetch("/api/join-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          displayName: userName,
        })
      });

      if (!joinRes.ok) {
        const data = await joinRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to join campaign");
      }
    } catch (err: any) {
      console.error("Join campaign error:", err);
      setError(err.message || "An unexpected error occurred while placing your candidacy.");
    } finally {
      setIsJoining(false);
    }
  };

  // Continuous incremental voting
  const handleVote = async (e?: React.MouseEvent<HTMLButtonElement>, candidateId?: string) => {
    if (e) e.stopPropagation();
    setError(null);

    const isFrozen = campaign.isFrozen;
    if (isFrozen) {
      setError("This campaign's votes are currently frozen. Casting new votes is disabled.");
      return;
    }

    const campaignCategory = getCampaignCategory(campaign);
    if (campaignCategory === "locations") {
      const oneHourMs = 60 * 60 * 1000;
      const isPingRecent = lastPingAt && (new Date().getTime() - lastPingAt.getTime() < oneHourMs);

      if (!isPingRecent || pingError) {
        forcePing();
        setError(pingError || "You must be pinged in this location within the last hour to vote! Attempting to ping your GPS now...");
        return;
      }

      if (!currentCity) {
        setError("Your GPS location could not be determined. Please ensure location services are allowed.");
        return;
      }

      const campaignTitle = (campaign.domainTitle || "").toLowerCase();
      // Relaxed inclusion check
      if (!campaignTitle.includes(currentCity) && !currentCity.includes(campaignTitle)) {
        setError(`You can only vote for locations if you are pinged in that location! You appear to be in '${currentCity}'.`);
        return;
      }
    }

    const targetId = candidateId || selectedBallotCandidate;
    if (!targetId) {
      setError("No contender selected.");
      return;
    }

    if (targetId === userId) {
      setError("Self-voting is strictly forbidden. You cannot vote for yourself!");
      return;
    }

    if (hasVoted) {
      setError("You have already cast your single vote in this kingdom's campaign.");
      return;
    }

    if (isCastingVote) return;
    setIsCastingVote(targetId);

    // Create a floating feedback effect on page coordinates if clicked
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const effectId = Date.now() + Math.random();
      const newEffect: FloatingEffect = {
        id: effectId,
        candidateId: targetId,
        x: e.clientX - rect.left || 30,
        y: e.clientY - rect.top || -10,
      };
      setFloatingEffects((prev) => [...prev, newEffect]);

      // Cleanup floating feedback
      setTimeout(() => {
        setFloatingEffects((prev) => prev.filter((eff) => eff.id !== effectId));
      }, 1200);
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/cast-vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          candidateId: targetId,
          latitude: latitude || null,
          longitude: longitude || null,
          city: currentCity || null,
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cast vote");
      }
    } catch (err: any) {
      console.error("Voting error:", err);
      setError(err.message || "Failed to cast vote. Try again.");
    } finally {
      setIsCastingVote(null);
    }
  };

  // Archive/Take Down the entire campaign
  const handleTakeDown = async () => {
    if (!window.confirm("Are you sure you want to retire this kingdom? Once taken down, it will no longer be visible on the board.")) {
      return;
    }
    try {
      const campaignDocRef = doc(db, "campaigns", campaign.id);
      try {
        await updateDoc(campaignDocRef, {
          status: "taken_down",
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `campaigns/${campaign.id}`);
      }
      onBack();
    } catch (err: any) {
      console.error(err);
      setError("Failed to retire this campaign. Please try again.");
    }
  };

  // Determine top score (the leader)
  const highestScore = candidates.length > 0 ? candidates[0].voteCount : 0;

  const isResolvingInitialCandidate = !!initialSelectedCandidateUserId && !selectedCandidate && !initialSelectDone;

  if (isResolvingInitialCandidate) {
    return (
      <div className="fixed top-[73px] bottom-[65px] left-0 right-0 z-30 bg-[#fcfcfd] dark:bg-[#0b0f19] w-full h-[calc(100dvh-138px)] flex flex-col items-center justify-center p-8 text-center space-y-4 font-sans">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500/10 border-t-amber-500 animate-spin" />
          <Crown className="w-5 h-5 text-amber-500 absolute inset-0 m-auto animate-pulse" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display font-black text-xs uppercase tracking-widest text-slate-800 dark:text-slate-100">
            Sealing Connection
          </h3>
          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
            Entering the throneroom...
          </p>
        </div>
      </div>
    );
  }

  if (selectedCandidate) {
    return (
      <CandidateCampaignScreen
        campaign={campaign}
        candidate={selectedCandidate}
        onBack={() => setSelectedCandidate(null)}
        userId={userId}
        userName={userName}
        userPhotoURL={userPhotoURL || null}
        userProfiles={userProfiles || []}
      />
    );
  }

  return (
    <div 
      ref={containerRef}
      id="campaign-detail-container"
      className="fixed top-[73px] bottom-[65px] left-0 right-0 z-30 bg-[#fcfcfd] dark:bg-[#0b0f19] w-full overflow-y-auto no-scrollbar font-sans selection:bg-amber-100 selection:text-amber-900"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        #campaign-detail-container::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
      {showAllCampaignsPage && (
        <div className="fixed inset-0 z-[60] bg-[#fcfcfd] dark:bg-[#0b0f19] overflow-y-auto p-4 sm:p-8 flex flex-col font-sans pt-24 pb-12 animate-fade-in">
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAllCampaignsPage(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display font-black text-xl text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                All Campaigns in {campaign.domainTitle}
              </h2>
            </div>

            {/* Search bar at the top that searches campaigns by usernames */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search campaigns by creator username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all dark:text-white"
              />
            </div>

            {/* Campaigns grid */}
            {(() => {
              const filtered = candidates.filter((c) => {
                const term = searchQuery.toLowerCase();
                return c.displayName.toLowerCase().includes(term);
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-12 text-slate-400 font-mono text-sm uppercase">
                    [ No matching campaigns found ]
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filtered.map((c, index) => {
                    return (
                      <div
                        key={c.id || c.userId || index}
                        onClick={() => setSelectedCandidate(c)}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900 hover:border-amber-500 transition-all relative overflow-hidden group flex flex-col justify-between h-44 cursor-pointer shadow-xs hover:shadow-md"
                      >
                        {/* Banner Image */}
                        <div className="h-20 w-full relative overflow-hidden bg-slate-200 dark:bg-slate-950 shrink-0">
                          {c.bannerURL ? (
                            <img src={c.bannerURL || undefined} alt="Campaign Banner" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-r from-amber-500/10 to-amber-500/20 flex items-center justify-center font-display font-black text-amber-500/20 text-lg uppercase tracking-widest">
                              CLAIM
                            </div>
                          )}
                          {/* Overlay gradient for contrast on text */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                          
                          {/* Floating Avatar & Candidate Name */}
                          <div className="absolute bottom-2 left-3 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full overflow-hidden border border-white dark:border-slate-800 bg-slate-300 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              {c.photoURL ? (
                                <img src={c.photoURL || undefined} alt={c.displayName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs">👑</span>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] text-white font-bold tracking-tight truncate max-w-[150px]">
                                {c.displayName}
                              </span>
                              <span className="text-[7px] text-white/80 font-mono uppercase tracking-wider">
                                Claimant
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                CAMPAIGN
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">
                                {c.voteCount} VOTES
                              </span>
                            </div>
                            <h3 className="font-display font-black text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-tight uppercase line-clamp-1 mt-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                              {c.campaignTitle || `${c.displayName}'s Campaign`}
                            </h3>
                          </div>

                          {/* Footer - active candidate text removed, shows Crown leader if isKing */}
                          {c.isKing && (
                            <div className="flex items-center justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                              <span className="text-amber-500 font-bold flex items-center gap-1 text-[9px] uppercase tracking-wider">
                                <Crown className="w-3.5 h-3.5" /> CURRENT LEADER
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* SECTION 1: HEADER & BALLOT */}
      <section id="section-0" className="w-full flex flex-col pt-4 pb-4 shrink-0 px-4">
        <div className="w-full max-w-3xl mx-auto flex flex-col justify-start gap-4">
          {/* Elegant Navigation Bar */}
          <div className="flex items-center justify-between py-1 shrink-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to domains</span>
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-rose-300 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 shrink-0">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
              {error}
            </div>
          )}

          {/* Hero Header Section */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden shrink-0 min-h-[160px] flex flex-col justify-center"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="absolute top-4 right-4 z-20 flex items-center">
              {userJoined ? (
                <button
                   onClick={() => {
                     if (isGuest) {
                       setError("Guests cannot quit campaigns.");
                       return;
                     }
                     setShowQuitPrompt(true)
                   }}
                   disabled={isLeaving}
                   className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-mono tracking-wider font-extrabold border transition-all cursor-pointer shadow-xs bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-rose-500/10 text-slate-500 hover:text-[#e11d48] min-w-[80px]"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>{isLeaving ? "LVR..." : "QUIT"}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isGuest) {
                      setError("Guests cannot join campaigns. Please register an account.");
                      return;
                    }
                    setShowOptInPrompt(true)
                  }}
                  disabled={isJoining}
                  className="flex items-center justify-center gap-1.5 h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white font-mono font-extrabold text-[10px] tracking-wider rounded-xl transition-all cursor-pointer shadow-xs min-w-[80px]"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                  <span>{isJoining ? "OPT..." : "OPT IN"}</span>
                </button>
              )}
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 relative z-10">
              <div className="space-y-1.5 text-left pr-20 md:pr-24">
                <h1 className="font-display font-bold text-2xl md:text-3xl text-slate-900 dark:text-white tracking-tight uppercase max-w-xl break-words">
                  {cleanedDetailTitle}
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
                  {campaign.domainType || "KINGDOM"} • <strong className="text-slate-700 dark:text-slate-200">{candidates.length}</strong> {candidates.length === 1 ? "contender" : "contenders"}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Campaigns Box */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs relative overflow-hidden shrink-0 flex flex-col gap-4"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/20" />
            
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-slate-950 dark:text-slate-200 text-xs tracking-widest uppercase flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                Campaigns
              </h3>
              <button
                type="button"
                onClick={() => setShowAllCampaignsPage(true)}
                className="text-[10px] text-amber-600 dark:text-amber-500 font-extrabold hover:underline uppercase tracking-wider cursor-pointer flex items-center gap-1"
              >
                See All →
              </button>
            </div>

            {/* Quick list of featured campaigns (except current one) */}
            {(() => {
              if (candidates.length === 0) {
                return (
                  <div className="text-center py-4 text-xs font-mono text-slate-400 uppercase">
                    [ No other active campaigns available ]
                  </div>
                );
              }
              return (
                <RandomCampaignSlider
                  candidates={candidates}
                  setSelectedCandidate={setSelectedCandidate}
                />
              );
            })()}
          </motion.div>
        </div>
      </section>

      {/* SECTION 2: DOMAIN PANELS (Leaderboard & Court) */}
      <section id="section-1" className="w-full px-4 pt-12 pb-4 shrink-0 flex flex-col">
        <div className="w-full max-w-3xl mx-auto flex flex-col">
          {/* TABS SELECTION BAR */}
          <div className="flex border-b border-slate-200 dark:border-slate-800/80 mb-6 font-mono text-xs font-black uppercase tracking-widest gap-2 shrink-0">
            <button
              id="tab-leaderboard"
              onClick={() => setActiveTab("leaderboard")}
              className={`px-4 py-2.5 border-b-2 -mb-[2px] transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "leaderboard"
                  ? "border-amber-500 text-amber-500 font-extrabold"
                  : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Domain Leaderboard</span>
            </button>
          </div>

      <div className="flex-1 min-h-0 relative rounded-[20px] shadow-sm flex flex-col pb-4">
        <AnimatePresence mode="wait">
          {activeTab === "leaderboard" && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="w-full h-full flex flex-col"
            >
              {/* Competitors List Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="font-display font-medium text-lg text-slate-800 dark:text-slate-205 flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-400" />
                  Domain Leaderboard
                </h2>
                {userDetailRank ? (
                  <div id="kingdom-rank-badge" className="flex items-center gap-3 px-3 py-1.5 rounded-xl border bg-amber-500/5 border-amber-500/25 dark:border-amber-500/15 text-slate-800 dark:text-slate-200 font-mono shadow-xs select-none shrink-0">
                    <Award className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                    <div className="flex flex-col text-left leading-none">
                      <span className="text-[8px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                        Rank
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-[11px] mt-0.5">
                        [{userDetailRank} of {totalCandidates}]
                      </span>
                    </div>
                    <div className="h-5 w-px bg-amber-500/15 shrink-0" />
                    <div className="flex flex-col text-left leading-none">
                      <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">
                        Percentile
                      </span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-[11px] mt-0.5">
                        Top {Math.max(1, Math.round((userDetailRank / Math.max(1, totalCandidates)) * 100))}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/85 text-slate-500 dark:text-slate-400 font-mono shadow-xs select-none shrink-0 h-10">
                    <span className="text-xs">📟</span>
                    <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                      Terminal Mode
                    </span>
                  </div>
                )}
              </div>

              {candidates.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 dark:bg-slate-900/20 border border-dashed border-slate-250 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 text-xs font-mono shrink-0">
                  📯 [ FLAPS EMPTY · NO REGENTS LOGGED IN THE LEDGER ]
                </div>
              ) : (
                <div className="border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#07080a] flex flex-col shadow-sm relative font-mono select-none rounded-[20px] mb-8">
                  {/* Header Row */}
                  <div className="grid grid-cols-12 bg-slate-200/85 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 text-[9px] font-mono font-black text-slate-550 dark:text-slate-400 uppercase tracking-widest divide-x divide-slate-300 dark:divide-slate-800 shrink-0">
                    <div className="col-span-2 py-1.5 text-center flex items-center justify-center font-bold">RANK</div>
                    <div className="col-span-1 py-1.5 text-center flex items-center justify-center font-bold">CREST</div>
                    <div className="col-span-5 py-1.5 px-3 text-left flex items-center font-bold">CLAIMANT ID</div>
                    <div className="col-span-2 py-1.5 text-center flex items-center justify-center font-bold">VOTES</div>
                    <div className="col-span-2 py-1.5 text-center flex items-center justify-center font-bold">TREND</div>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-[#07080a]">
                    <AnimatePresence mode="popLayout">
                    {candidates.slice(0, 100).map((cand, index) => {
                      const isWinner = cand.voteCount === highestScore && cand.voteCount > 0;
                      const place = index + 1;
                      const paddedPlace = place < 10 ? `0${place}` : `${place}`;
                      const trendStatus = getPlayerTrend(cand.id, cand.voteCount);

                      const profile = userProfiles?.find((p) => p.uid === cand.userId);
                      let currentName = profile?.displayName || cand.displayName;
                      if ((!currentName || currentName.toLowerCase().includes("unknown")) && cand.userId === userId) {
                        currentName = auth.currentUser?.displayName || cand.displayName;
                      }
                      let currentPhoto = profile?.photoURL !== undefined ? profile.photoURL : (cand.photoURL || null);
                      if (!currentPhoto && cand.userId === userId) {
                        currentPhoto = auth.currentUser?.photoURL || null;
                      }

                      // Safe truncate of username to fit beautifully inside the terminal grid blocks
                      const rawName = currentName.trim().slice(0, 10).toUpperCase();
                      // If username is shorter, pad the SplitFlap text
                      const paddedName = rawName.padEnd(10, " ");
                      const voteString = String(cand.voteCount || 0).padStart(4, "0");
                      const isCurrentUser = cand.userId === userId;

                      return (
                        <motion.div
                          key={cand.id || cand.userId || index}
                          layoutId={`candidate-${cand.id || cand.userId || index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          className={`grid grid-cols-12 transition-colors duration-100 divide-x divide-slate-200 dark:divide-slate-800 items-center hover:bg-slate-200/50 dark:hover:bg-slate-900/40 relative ${
                            isCurrentUser
                              ? "bg-amber-500/5 dark:bg-[#09100d]/40 text-emerald-600 dark:text-emerald-400 font-extrabold shadow-[inset_0_0_12px_rgba(16,185,129,0.06)]"
                              : "bg-white dark:bg-transparent"
                          }`}
                        >
                          {isCurrentUser && (
                            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-emerald-500 z-10" />
                          )}

                          {/* Column 1: Rank */}
                          <div className="col-span-2 py-1.5 flex justify-center">
                            <SplitFlapWord text={`#${paddedPlace}`} glow={isCurrentUser ? "green" : (index === 0 ? "green" : "amber")} />
                          </div>

                          {/* Column 2: Crest */}
                          <div 
                            className="col-span-1 py-1 flex justify-center items-center cursor-pointer group/crest relative"
                            onClick={() => {
                              if (onViewProfile) {
                                onViewProfile({ uid: cand.userId, displayName: currentName, photoURL: currentPhoto });
                              }
                            }}
                            title={`View ${currentName}'s Royal Profile`}
                          >
                            {currentPhoto ? (
                              <img
                                src={currentPhoto || undefined}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-5.5 h-5.5 rounded-md object-cover ring-1 ring-amber-500/25 shrink-0 group-hover/crest:scale-110 active:group-hover/crest:scale-95 transition-all duration-150 group-hover/crest:ring-amber-400"
                              />
                            ) : (
                              <div className="w-5.5 h-5.5 rounded-md bg-slate-300/70 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 ring-1 ring-slate-400/20 shrink-0 group-hover/crest:scale-110 active:group-hover/crest:scale-95 transition-all duration-150 group-hover/crest:ring-amber-500/40">
                                <CircleUser className="w-4 h-4 text-slate-400 group-hover/crest:text-amber-500 stroke-[1.25] transition-colors" />
                              </div>
                            )}
                          </div>

                          {/* Column 3: Name & Badges */}
                          <div 
                            className="col-span-5 py-1.5 px-3 flex items-center min-w-0 cursor-pointer hover:opacity-85"
                            onClick={() => {
                              if (onViewProfile) {
                                onViewProfile({ uid: cand.userId, displayName: currentName, photoURL: currentPhoto });
                              }
                            }}
                            title={`View ${currentName}'s Royal Profile`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SplitFlapWord text={paddedName} glow={isCurrentUser ? "green" : "white"} />
                              {index === 0 && cand.voteCount > 0 && (
                                <span className="text-[10px] shrink-0 animate-pulse">👑</span>
                              )}
                            </div>
                          </div>

                          {/* Column 4: Vote String */}
                          <div className="col-span-2 py-1.5 flex justify-center">
                            <SplitFlapWord text={voteString} glow={isCurrentUser ? "green" : (cand.voteCount > 0 ? "amber" : "white")} />
                          </div>

                          {/* Column 5: Trend Indicator */}
                          <div className="col-span-2 py-1.5 flex justify-center items-center text-center">
                            {trendStatus === "up" ? (
                              <ArrowUp className="w-3 h-3 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
                            ) : trendStatus === "down" ? (
                              <ArrowDown className="w-3 h-3 text-rose-500 dark:text-rose-400 stroke-[3]" />
                            ) : (
                              <span className="text-slate-500 font-bold font-mono text-xs leading-none">—</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
        </div>
      </section>

      {/* Floating Prompt for Campaign Opt-In */}
      <AnimatePresence>
        {showOptInPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs select-none p-4 animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl max-w-sm w-full text-center font-mono"
            >
              <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-600 dark:text-amber-400 mb-3.5">
                <Award className="w-5 h-5 animate-pulse" />
              </div>
              <p className="text-xs text-slate-805 dark:text-slate-100 mb-5 leading-relaxed">
                do you wish to opt into this campaign [yes or no]?
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setShowOptInPrompt(false);
                    executeJoin();
                  }}
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  YES
                </button>
                <button
                  onClick={() => setShowOptInPrompt(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
                >
                  NO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Prompt for Campaign Quit */}
      <AnimatePresence>
        {showQuitPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs select-none p-4 animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl max-w-sm w-full text-center font-mono"
            >
              <div className="mx-auto w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-600 dark:text-rose-400 mb-3.5">
                <LogOut className="w-4.5 h-4.5 shrink-0" />
              </div>
              <p className="text-xs text-slate-805 dark:text-slate-100 mb-5 leading-relaxed">
                do you wish to quit this campaign? [yes or no]
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setShowQuitPrompt(false);
                    executeLeave();
                  }}
                  className="flex-1 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  YES
                </button>
                <button
                  onClick={() => setShowQuitPrompt(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
                >
                  NO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
