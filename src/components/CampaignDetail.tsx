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
import { Crown, Users, ArrowLeft, Plus, Sparkles, AlertCircle, CircleUser, Vote, ShieldCheck, Trash2, ArrowUp, ArrowDown, FolderTree, Minus, Trophy, Award, LogOut, Image as ImageIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Edit3, Clock, Check, Settings, Search, UserCircle } from "lucide-react";
import { Campaign, Candidate, VoteLog } from "../types";
import { getCampaignCategory } from "../utils";
import { useLocationPing } from "../contexts/LocationContext";
import { motion, AnimatePresence } from "motion/react";
import KingdomCourtBuilder from "./KingdomCourtBuilder";
import CampaignFeed from "./CampaignFeed";
import CreatePostModal from "./CreatePostModal";
import CandidateCampaignScreen from "./CandidateCampaignScreen";
import Campaign3DCarousel from "./Campaign3DCarousel";

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
  const [activeTab, setActiveTab] = useState<"leaderboard" | "court" | "pending">("leaderboard");
  const containerRef = useRef<HTMLDivElement>(null);

  const [creatorCourt, setCreatorCourt] = useState<any | null>(null);
  const [showAllCampaignsPage, setShowAllCampaignsPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickVoteSearchQuery, setQuickVoteSearchQuery] = useState("");
  const [selectedQuickVoteCandidate, setSelectedQuickVoteCandidate] = useState<string | null>(null);
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [initialSelectDone, setInitialSelectDone] = useState(false);

  // Real-time Campaign Object & Editing States
  const [currentCampaign, setCurrentCampaign] = useState<Campaign>(campaign);
  const [isEditSettingsOpen, setIsEditSettingsOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState(campaign.domainTitle || "");
  const [settingsPendingTime, setSettingsPendingTime] = useState<"none" | "24hours" | "72hours" | "upon_approval">(
    campaign.pendingTime || "24hours"
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isApproving, setIsApproving] = useState<string | null>(null);

  const isGuest = userId.startsWith("local_");

  // Subscribe to real-time changes of the campaign settings
  useEffect(() => {
    setCurrentCampaign(campaign);
    setSettingsTitle(campaign.domainTitle || "");
    setSettingsPendingTime(campaign.pendingTime || "24hours");
  }, [campaign]);

  useEffect(() => {
    if (!campaign?.id) return;
    const docRef = doc(db, "campaigns", campaign.id);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const updatedCamp = {
          id: snap.id,
          ...data
        } as Campaign;
        setCurrentCampaign(updatedCamp);
        setSettingsTitle(updatedCamp.domainTitle || "");
        setSettingsPendingTime(updatedCamp.pendingTime || "24hours");
      }
    }, (err) => {
      console.error("Error listening to campaign settings changes:", err);
    });
    return () => unsubscribe();
  }, [campaign.id]);

  const isCandidatePending = (cand: Candidate) => {
    if (cand.status !== "pending") return false;
    if (!cand.pendingUntil) return true; // upon_approval or indefinite manually pending
    
    // Check if timestamp is expired
    const pendingUntilMs = cand.pendingUntil.seconds 
      ? cand.pendingUntil.seconds * 1000 
      : new Date(cand.pendingUntil as any).getTime();
    return Date.now() < pendingUntilMs;
  };

  const activeCandidates = candidates.filter(c => !isCandidatePending(c));
  const pendingCandidates = candidates.filter(c => isCandidatePending(c));

  const handleApproveCandidate = async (candId: string) => {
    setIsApproving(candId);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/approve-candidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          candidateId: candId
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve candidate");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to approve claimant.");
    } finally {
      setIsApproving(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/update-campaign-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          domainTitle: settingsTitle,
          pendingTime: settingsPendingTime
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      setIsEditSettingsOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save campaign settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

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
      if (auth.currentUser) {
        auth.currentUser.getIdToken().then(token => {
          fetch("/api/log-campaign-visit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ targetUserId: campaign.creatorId })
          }).catch(err => console.error("Failed to log campaign visit", err));
        }).catch(() => {});
      } else {
        fetch("/api/log-campaign-visit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ targetUserId: campaign.creatorId })
        }).catch(err => console.error("Failed to log campaign visit", err));
      }
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
      const overlays = document.querySelectorAll('#profile-screen-container, #campaign-detail-container, #candidate-campaign-container');
      if (overlays.length <= 1) {
        document.body.style.overflow = "auto";
      } else {
        document.body.style.overflow = originalOverflow;
      }
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

  const leaderboardCandidates = activeCandidates.filter(c => c.voteCount > 0);
  const userLeaderboardIndex = leaderboardCandidates.findIndex((c) => c.userId === userId);
  const userDetailRank = userLeaderboardIndex !== -1 ? userLeaderboardIndex + 1 : null;
  const totalCandidates = leaderboardCandidates.length;

  const currentUserCandidate = candidates.find((c) => c.userId === userId);
  const isCurrentUserPending = currentUserCandidate ? isCandidatePending(currentUserCandidate) : false;

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

  const isUserInPedigree = userId === currentCampaign.creatorId || (creatorCourt?.members || []).some((m: any) => m.userId === userId);

  const cleanedDetailTitle = currentCampaign.domainTitle || "";

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
          displayName: userName || auth.currentUser?.displayName || "Sovereign Claimant",
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
        campaign={currentCampaign}
        candidate={selectedCandidate}
        onBack={() => setSelectedCandidate(null)}
        userId={userId}
        userName={userName}
        userPhotoURL={userPhotoURL || null}
        userProfiles={userProfiles || []}
      />
    );
  }

  const scrollToSection = (index: number) => {
    const el = containerRef.current?.querySelector(`#section-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div 
      ref={containerRef}
      id="campaign-detail-container"
      className="fixed top-[73px] bottom-[65px] left-0 right-0 z-30 bg-[#fcfcfd] dark:bg-[#0b0f19] w-full h-[calc(100dvh-138px)] overflow-y-scroll snap-y snap-mandatory no-scrollbar font-sans selection:bg-amber-100 selection:text-amber-900"
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
      <section id="section-0" className="w-full h-full snap-start flex flex-col justify-between px-4 shrink-0 pt-4 pb-2 overflow-hidden">
        <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-between relative h-full">
          <div className="flex flex-col gap-3.5 w-full">
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
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-rose-300 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                {error}
              </div>
            )}

            {/* Hero Header Section */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative bg-slate-50 dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden shrink-0 min-h-[110px] flex flex-col justify-center"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {userJoined ? (
                  <button
                     onClick={() => {
                       if (isGuest) {
                         setError(isCurrentUserPending ? "Guests cannot cancel requests." : "Guests cannot quit campaigns.");
                         return;
                       }
                       setShowQuitPrompt(true)
                     }}
                     disabled={isLeaving}
                     className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-mono tracking-wider font-extrabold border transition-all cursor-pointer shadow-xs bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-rose-500/10 text-slate-500 hover:text-[#e11d48] min-w-[80px]"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>{isLeaving ? (isCurrentUserPending ? "CNL..." : "LVR...") : (isCurrentUserPending ? "CANCEL REQ" : "QUIT")}</span>
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
                <div className="space-y-1 text-left pr-20 md:pr-24">
                  <h1 className="font-display font-bold text-xl md:text-2xl text-slate-900 dark:text-white tracking-tight uppercase max-w-xl break-words">
                    {cleanedDetailTitle}
                  </h1>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
                    {currentCampaign.domainType || "KINGDOM"} • <strong className="text-slate-700 dark:text-slate-200">{activeCandidates.length}</strong> {activeCandidates.length === 1 ? "contender" : "contenders"}
                  </p>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 shrink-0">
              {/* Quick Vote Box */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm relative flex flex-col justify-center"
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500/20" />
                <div className="flex items-center gap-2 shrink-0 relative z-10">
                  <button
                    onClick={() => {
                      if (selectedQuickVoteCandidate) {
                         const cand = activeCandidates.find(c => c.id === selectedQuickVoteCandidate);
                         if (window.confirm(`Are you sure you want to vote for ${cand?.displayName}?`)) {
                           handleVote(undefined, selectedQuickVoteCandidate);
                           setQuickVoteSearchQuery("");
                           setSelectedQuickVoteCandidate(null);
                         }
                      }
                    }}
                    disabled={!selectedQuickVoteCandidate || isCastingVote !== null}
                    className="h-9 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:dark:bg-slate-800 text-white disabled:text-slate-500 font-mono font-extrabold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-xs flex items-center justify-center shrink-0"
                  >
                    {isCastingVote ? "VOTING..." : "QUICK VOTE"}
                  </button>
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search claimant..."
                      value={quickVoteSearchQuery}
                      onChange={(e) => {
                        setQuickVoteSearchQuery(e.target.value);
                        setSelectedQuickVoteCandidate(null);
                      }}
                      className="w-full h-9 bg-slate-200/50 dark:bg-slate-950/50 border border-slate-300 dark:border-slate-800 rounded-xl py-2 pl-8 pr-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    
                    {/* Dropdown for search results */}
                    {quickVoteSearchQuery.trim() !== "" && !selectedQuickVoteCandidate && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden max-h-[160px] flex flex-col">
                        <div className="flex-1 overflow-y-auto no-scrollbar p-1 space-y-1">
                           {activeCandidates.filter(c => c.displayName?.toLowerCase().includes(quickVoteSearchQuery.toLowerCase())).length === 0 ? (
                              <div className="text-center py-4 text-[10px] font-mono text-slate-400 uppercase">
                                [ No claimants found ]
                              </div>
                           ) : (
                             activeCandidates
                               .filter(c => c.displayName?.toLowerCase().includes(quickVoteSearchQuery.toLowerCase()))
                               .map(c => (
                                 <button
                                   key={c.id}
                                   onClick={() => {
                                     setSelectedQuickVoteCandidate(c.id);
                                     setQuickVoteSearchQuery(c.displayName || "");
                                   }}
                                   className={`w-full flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all shrink-0 ${
                                     selectedQuickVoteCandidate === c.id
                                       ? "border-emerald-500 bg-emerald-500/10"
                                       : "border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                   }`}
                                 >
                                   {c.photoURL ? (
                                     <img src={c.photoURL} className="w-6 h-6 rounded-md object-cover" />
                                   ) : (
                                     <div className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                       <UserCircle className="w-4 h-4 text-slate-400" />
                                     </div>
                                   )}
                                   <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                     {c.displayName}
                                   </span>
                                 </button>
                               ))
                           )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Campaigns Box */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm relative overflow-hidden flex flex-col gap-2"
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/20" />
                
                <div className="flex items-center justify-between pb-1">
                  <h3 className="font-display font-black text-slate-950 dark:text-slate-200 text-xs tracking-widest uppercase flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    Featured Campaigns
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
                  if (activeCandidates.length === 0) {
                    return (
                      <div className="text-center py-4 text-xs font-mono text-slate-400 uppercase">
                        [ No other active campaigns available ]
                      </div>
                    );
                  }
                  return (
                    <Campaign3DCarousel
                      candidates={activeCandidates}
                      userProfiles={userProfiles || []}
                      onViewProfile={onViewProfile || (() => {})}
                      setSelectedCandidate={setSelectedCandidate}
                    />
                  );
                })()}
              </motion.div>
            </div>
          </div>

          {/* Prompt to scroll to Domain Leaderboard */}
          <div className="flex justify-center pt-2 pb-2 shrink-0">
            <button
              onClick={() => scrollToSection(1)}
              className="flex flex-col items-center gap-1 text-slate-400 hover:text-amber-500 transition-colors duration-200 font-mono text-[9px] uppercase tracking-widest cursor-pointer mt-1"
            >
              <span>View Leaderboard</span>
              <ChevronDown className="w-4 h-4 text-amber-500 animate-pulse" />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2: DOMAIN PANELS (Leaderboard) */}
      <section id="section-1" className="w-full h-full snap-start flex flex-col justify-between px-4 shrink-0 pt-4 pb-4 overflow-hidden">
        <div className="w-full max-w-3xl mx-auto flex flex-col justify-start gap-4 pb-4 h-full relative">
          
          {/* Smooth scroll up arrow indicator */}
          <div className="flex justify-center pt-2 pb-4">
            <button
              type="button"
              onClick={() => scrollToSection(0)}
              className="flex flex-col items-center gap-1 group text-slate-400 hover:text-amber-500 transition-colors duration-200 cursor-pointer"
            >
              <ChevronUp className="w-4 h-4 animate-bounce text-amber-500/80 group-hover:text-amber-500" />
              <span className="text-[8px] font-mono font-bold tracking-[0.2em] uppercase opacity-75 group-hover:opacity-100">
                Return to Campaign Info
              </span>
            </button>
          </div>

          {/* Leaderboard content inside scrollable wrapper */}
          <div className="flex-1 overflow-y-auto pr-1 pb-6 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent flex flex-col min-h-0">
            {/* Elegant Tab Switcher for Domain Leaderboard vs Pending Approvals */}
            {userId === currentCampaign.creatorId && pendingCandidates.length > 0 && (
              <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("leaderboard")}
                  className={`px-3 py-1.5 text-[10px] font-mono font-extrabold tracking-wider uppercase rounded-xl transition-all cursor-pointer ${
                    activeTab === "leaderboard"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "text-slate-500 hover:text-amber-500 bg-slate-100 dark:bg-slate-800/50"
                  }`}
                >
                  Leaderboard
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("pending")}
                  className={`px-3 py-1.5 text-[10px] font-mono font-extrabold tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "pending"
                      ? "bg-rose-500 text-white shadow-xs"
                      : "text-slate-500 hover:text-rose-500 bg-slate-100 dark:bg-slate-800/50"
                  }`}
                >
                  <span>Escrow & Approvals</span>
                  <span className="px-1.5 py-0.5 bg-black/10 dark:bg-white/10 text-[9px] rounded-full font-black">
                    {pendingCandidates.length}
                  </span>
                </button>
              </div>
            )}

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

              {leaderboardCandidates.length === 0 ? (
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
                    {leaderboardCandidates.slice(0, 100).map((cand, index) => {
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

          {activeTab === "pending" && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="w-full h-full flex flex-col space-y-4"
            >
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h2 className="font-display font-medium text-lg text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-400" />
                  Pending Escrow & Approvals
                </h2>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono leading-relaxed">
                [ ROYAL SECURITY ESCROW: THE FOLLOWING CANDIDATES REQUEST ACCESS TO THE LEADERBOARD IN THIS DOMAIN. ]
              </p>

              {pendingCandidates.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 dark:bg-slate-900/20 border border-dashed border-slate-250 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 text-xs font-mono shrink-0">
                  📯 [ ALL ESCROW CLAIMS CLEARED AND INSTATED ]
                </div>
              ) : (
                <div className="border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#07080a] flex flex-col shadow-sm relative font-mono select-none rounded-[20px] overflow-hidden">
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-[#07080a]">
                    {pendingCandidates.map((cand, idx) => {
                      const profile = userProfiles?.find((p) => p.uid === cand.userId);
                      const currentName = profile?.displayName || cand.displayName;
                      const currentPhoto = profile?.photoURL !== undefined ? profile.photoURL : (cand.photoURL || null);
                      
                      // Calculate validation countdown
                      let remainingText = "Manual approval required";
                      if (cand.pendingUntil) {
                        const remainingMs = (cand.pendingUntil.seconds 
                          ? cand.pendingUntil.seconds * 1000 
                          : new Date(cand.pendingUntil as any).getTime()) - Date.now();
                        if (remainingMs > 0) {
                          const hours = Math.floor(remainingMs / (60 * 60 * 1000));
                          const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
                          remainingText = `${hours}h ${minutes}m remaining`;
                        } else {
                          remainingText = "Escrow period completed";
                        }
                      }

                      return (
                        <div key={cand.id || cand.userId || idx} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-200/20 dark:hover:bg-slate-900/20 transition-all">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-250 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              {currentPhoto ? (
                                <img src={currentPhoto || undefined} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm">👑</span>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 leading-tight">
                              <span className="font-extrabold text-slate-800 dark:text-slate-100 uppercase text-xs truncate">
                                {currentName}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-amber-500" />
                                {remainingText}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleApproveCandidate(cand.userId)}
                            disabled={isApproving === cand.userId}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/20 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer flex items-center gap-1 transition-all shrink-0"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>{isApproving === cand.userId ? "APPROVING..." : "APPROVE"}</span>
                          </button>
                        </div>
                      );
                    })}
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
                {isCurrentUserPending ? "do you wish to cancel your request to join this campaign? [yes or no]" : "do you wish to quit this campaign? [yes or no]"}
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
