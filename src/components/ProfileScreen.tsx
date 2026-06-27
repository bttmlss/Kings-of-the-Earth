import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs, query, orderBy, where, doc, getDoc, writeBatch, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Campaign, Candidate } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck, UserCircle, Award, Landmark, Crown, RefreshCw, Layers, ShieldAlert, Sparkles, LogOut, CheckCircle, ChevronRight, ChevronDown, ChevronUp, Edit3, Lock, Camera, Check, TrendingUp, Activity, Globe, ArrowLeft, Image as ImageIcon, Bell } from "lucide-react";
import { useVotingIndex } from "../hooks/useVotingIndex";
import VotingIndexChart from "./VotingIndexChart";
import LeaderboardScreen from "./LeaderboardScreen";
import Q2LeaderboardLiveAnimation from "./Q2LeaderboardLiveAnimation";
import DominionMapModal from "./DominionMapModal";
import UserCandlestickModal from "./UserCandlestickModal";
// @ts-ignore
import leaderboardBadge from "../assets/images/leaderboard_badge_1781916796236.jpg";

interface ProfileScreenProps {
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL?: string | null;
  };
  campaigns: Campaign[];
  onLogout: () => void;
  onEnterCampaign: (campaign: Campaign, targetUserId?: string) => void;
  onProfileUpdate?: (updated: { displayName: string | null; photoURL: string | null }) => void;
  isOwnProfile?: boolean;
  onBack?: () => void;
  onEditingChange?: (isEditing: boolean) => void;
  onOpenNotifications?: () => void;
}

interface UserContestStats {
  campaignId: string;
  domainTitle: string;
  voteCount: number;
  rank: number;
  isLeader: boolean;
  campaignTitle?: string;
}

const PRESET_CREST_AVATARS = [
  { id: "king", title: "Royal Crown", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80" },
  { id: "knight", title: "Gilded Knight", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" },
  { id: "queen", title: "Emerald Queen", url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80" },
  { id: "sorcerer", title: "Sage Wizard", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80" },
  { id: "unicorn", title: "Silver Pegasus", url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80" },
  { id: "valkyrie", title: "Gold Valkyrie", url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=110&q=80" }
];

export default function ProfileScreen({ user, campaigns, onLogout, onEnterCampaign, onProfileUpdate, isOwnProfile = true, onBack, onEditingChange, onOpenNotifications }: ProfileScreenProps) {
  const [foundedCount, setFoundedCount] = useState(0);
  const [contestedCampaigns, setContestedCampaigns] = useState<UserContestStats[]>([]);
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [crownsCount, setCrownsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllCampaignsModal, setShowAllCampaignsModal] = useState(false);
  const isGuest = user.uid.startsWith("local_");

  const containerRef = useRef<HTMLDivElement>(null);

  // Real-time Voting Index data for Q3 Widget
  const {
    points: overviewPoints,
    totalVotes: overviewTotal,
    deltaAbs: overviewDeltaAbs,
    deltaPct: overviewDeltaPct,
    isUp: overviewIsUp,
    isLoading: votingIndexLoading,
  } = useVotingIndex(user.uid, 30);

  // Drill-down states
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [showQ2Leaderboard, setShowQ2Leaderboard] = useState(false);
  const [showDominionMap, setShowDominionMap] = useState(false);
  const [showQ1Modal, setShowQ1Modal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(undefined);
  const [selectedDays, setSelectedDays] = useState<number>(30);

  // Drill-down query
  const {
    points: modalPoints,
    totalVotes: modalTotal,
    deltaAbs: modalDeltaAbs,
    deltaPct: modalDeltaPct,
    isUp: modalIsUp,
    isLoading: modalLoading,
  } = useVotingIndex(user.uid, selectedDays, selectedCampaignId);

  // Profile Edit states
  const [isEditing, setIsEditing] = useState(false);
  const handleSetEditing = (val: boolean) => {
    setIsEditing(val);
    onEditingChange?.(val);
  };
  const [editName, setEditName] = useState(user.displayName || "");
  const [editPhoto, setEditPhoto] = useState(user.photoURL || "");
  
  useEffect(() => {
    setEditName(user.displayName || "");
    setEditPhoto(user.photoURL || "");
  }, [user.displayName, user.photoURL]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNameTaken, setIsNameTaken] = useState<boolean | null>(null);

  const [bio, setBio] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isProfilePrivate, setIsProfilePrivate] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followStatus, setFollowStatus] = useState<"pending" | "accepted" | null>(null);
  const [isFollowLoading, setIsFollowLoading] = useState(true);

  useEffect(() => {
    async function loadBio() {
      if (!user.uid) return;
      
      // Log profile visit
      if (user.uid && user.uid !== auth.currentUser?.uid) {
        try {
          const token = await auth.currentUser?.getIdToken();
          await fetch("/api/log-profile-visit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ targetUserId: user.uid })
          });
        } catch (err) {
          console.error("Failed to log profile visit", err);
        }
      }

      const path = `user_profiles/${user.uid}`;
      try {
        const userProfileRef = doc(db, "user_profiles", user.uid);
        const userProfileSnap = await getDoc(userProfileRef);
        if (userProfileSnap.exists()) {
          const profileData = userProfileSnap.data();
          const pBio = profileData.bio || "";
          setBio(pBio);
          setEditBio(pBio);
          setIsProfilePrivate(!!profileData.isPrivate);
        } else {
          const localBio = localStorage.getItem(`local_bio_${user.uid}`) || "";
          setBio(localBio);
          setEditBio(localBio);
          setIsProfilePrivate(false);
        }
      } catch (err) {
        console.error("Error loading bio:", err);
        handleFirestoreError(err, OperationType.GET, path);
      }
    }
    loadBio();
  }, [user.uid]);

  // Load Follow stats
  useEffect(() => {
    async function loadFollows() {
      if (!user.uid) return;
      setIsFollowLoading(true);
      try {
        const followsRef = collection(db, "follows");
        
        // Get followers count
        const followersQ = query(followsRef, where("followingId", "==", user.uid));
        const followersSnap = await getDocs(followersQ);
        const followersCount = followersSnap.docs.filter(d => d.data().status === "accepted").length;
        setFollowersCount(followersCount);

        // Get following count
        const followingQ = query(followsRef, where("followerId", "==", user.uid));
        const followingSnap = await getDocs(followingQ);
        const followingCount = followingSnap.docs.filter(d => d.data().status === "accepted").length;
        setFollowingCount(followingCount);

        // Get current follow status if not own profile
        if (!isOwnProfile && auth.currentUser) {
          const statusQ = query(followsRef, where("followerId", "==", auth.currentUser.uid));
          const statusSnap = await getDocs(statusQ);
          const match = statusSnap.docs.find(d => d.data().followingId === user.uid);
          if (match) {
            setFollowStatus(match.data().status as "pending" | "accepted");
          } else {
            setFollowStatus(null);
          }
        }
      } catch (err) {
        console.error("Error loading follows:", err);
      } finally {
        setIsFollowLoading(false);
      }
    }
    loadFollows();
  }, [user.uid, isOwnProfile]);

  const handleFollowRequest = async () => {
    if (!auth.currentUser || isOwnProfile) return;
    try {
      const followId = `${auth.currentUser.uid}_${user.uid}`;
      const followRef = doc(db, "follows", followId);
      
      if (followStatus === "accepted" || followStatus === "pending") {
        // Unfollow or cancel request
        await deleteDoc(followRef);
        setFollowStatus(null);
        if (followStatus === "accepted") {
           setFollowersCount(prev => Math.max(0, prev - 1));
        }
      } else {
        // Send follow request
        const isPrivate = isProfilePrivate;
        const newStatus = isPrivate ? "pending" : "accepted";
        await setDoc(followRef, {
          followerId: auth.currentUser.uid,
          followingId: user.uid,
          status: newStatus,
          createdAt: serverTimestamp()
        });
        setFollowStatus(newStatus);
        if (newStatus === "accepted") {
           setFollowersCount(prev => prev + 1);
           
           // Create a notification for the user being followed
           try {
             const notifRef = doc(collection(db, "notifications"));
             await setDoc(notifRef, {
               userId: user.uid,
               type: "follow",
               title: "New Follower",
               body: `${auth.currentUser.displayName || "Someone"} started following you.`,
               read: false,
               createdAt: serverTimestamp(),
               sourceUserId: auth.currentUser.uid,
               sourceUserPhoto: auth.currentUser.photoURL || null,
               sourceUserName: auth.currentUser.displayName || null
             });
           } catch (notifErr) {
             console.error("Failed to create notification:", notifErr);
           }
        }
      }
    } catch (err) {
      console.error("Error toggling follow:", err);
    }
  };

  // Sync edits when user switches or updates
  useEffect(() => {
    setEditName(user.displayName || "");
    setEditPhoto(user.photoURL || "");
  }, [user]);

  // Real-time unique name check
  useEffect(() => {
    const trimmed = editName.trim().toLowerCase();
    if (!trimmed) {
      setIsNameTaken(null);
      return;
    }
    // If it's literally their own current name, it's valid
    if (trimmed === user.displayName?.trim().toLowerCase()) {
      setIsNameTaken(false);
      return;
    }
    
    const delayDebounceFn = setTimeout(async () => {
      try {
        const profilesRef = collection(db, "user_profiles");
        const nameSnap = await getDocs(profilesRef);
        const taken = nameSnap.docs.some(docSnap => 
          docSnap.id !== user.uid && 
          docSnap.data().displayName?.trim().toLowerCase() === trimmed
        );
        setIsNameTaken(taken);
      } catch (err) {
        console.error("Error checking name uniqueness:", err);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [editName, user.displayName, user.uid]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) {
      setErrorMessage("Guest accounts cannot edit profiles. Please log in.");
      return;
    }
    if (!editName.trim()) {
      setErrorMessage("Sovereign Name cannot be empty.");
      return;
    }
    
    setIsSaving(true);
    setErrorMessage(null);
    setSaveMessage(null);
    
    try {
      const trimmedName = editName.trim();
      const trimmedPhoto = editPhoto.trim();
      const trimmedBio = editBio.trim();
      
      const token = await auth.currentUser?.getIdToken();
      
      if (token && !isGuest) {
        const res = await fetch("/api/update-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            displayName: trimmedName,
            photoURL: trimmedPhoto || null,
            bio: trimmedBio
          })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update profile via API");
        }
      } else {
        // Fallback for purely local guest users or local storage
        const userProfileRef = doc(db, "user_profiles", user.uid);
        await setDoc(userProfileRef, {
          userId: user.uid,
          bio: trimmedBio,
          displayName: trimmedName,
          photoURL: trimmedPhoto || null
        }, { merge: true });
      }

      // Save locally to localStorage for immediate offline/guest retrieval
      localStorage.setItem(`local_bio_${user.uid}`, trimmedBio);

      // Update Auth profile if registered, otherwise default local session
      if (!isGuest) {
        if (auth.currentUser) {
          try {
            await updateProfile(auth.currentUser, {
              displayName: trimmedName,
              photoURL: (trimmedPhoto && trimmedPhoto.length > 2048) ? null : (trimmedPhoto || null)
            });
          } catch (profileErr) {
            console.warn("Failed to update Firebase Auth profile (might be too long, but saved to Firestore):", profileErr);
          }
        }
      } else {
        const localSession = {
          uid: user.uid,
          displayName: trimmedName,
          email: user.email,
          photoURL: trimmedPhoto || null
        };
        localStorage.setItem("local_sovereign_session", JSON.stringify(localSession));
      }
      
      // 3. Notify parent app state
      if (onProfileUpdate) {
        onProfileUpdate({
          displayName: trimmedName,
          photoURL: trimmedPhoto || null
        });
      }

      setBio(trimmedBio);
      
      setSaveMessage("Your Proclamation & Crest were successfully sealed!");
      setTimeout(() => {
        handleSetEditing(false);
        setSaveMessage(null);
      }, 1500);
    } catch (err: any) {
      console.error("Save Profile Error:", err);
      setErrorMessage("The Great Ledger rejected the seal. Details: " + (err.message || String(err)));
      handleFirestoreError(err, OperationType.WRITE, `user_profiles/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

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

  useEffect(() => {
    async function loadContestedKingdoms() {
      setIsLoading(true);
      try {
        const matchingContests: UserContestStats[] = [];
        let cumVotes = 0;
        let cumCrowns = 0;

        // Fetch candidates for ALL campaigns to check if user belongs & calculate rank
        const promises = campaigns.map(async (camp) => {
          try {
            // Get candidate matching this user
            const docRef = doc(db, "campaigns", camp.id, "candidates", user.uid);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
              const userCandidate = snap.data() as Candidate;

              // Fetch all other candidates to calculate rank based only on those with > 0 votes
              const candsRef = collection(db, "campaigns", camp.id, "candidates");
              const q = query(candsRef, orderBy("voteCount", "desc"));
              const allCandsSnap = await getDocs(q);
 
              const leaderboardCands: Candidate[] = [];
              allCandsSnap.forEach((d) => {
                const candData = d.data() as Candidate;
                if (candData.voteCount > 0) {
                  leaderboardCands.push(candData);
                }
              });
 
              const index = leaderboardCands.findIndex((c) => c.userId === user.uid);
              const rank = userCandidate.voteCount > 0 && index !== -1 ? index + 1 : 0;
              const highestVotes = leaderboardCands.length > 0 ? leaderboardCands[0].voteCount : 0;
              const isLeader = userCandidate.voteCount === highestVotes && userCandidate.voteCount > 0;
 
              cumVotes += userCandidate.voteCount;
              if (isLeader) {
                cumCrowns += 1;
              }
 
              matchingContests.push({
                campaignId: camp.id,
                domainTitle: camp.domainTitle,
                voteCount: userCandidate.voteCount,
                rank,
                isLeader,
                campaignTitle: userCandidate.campaignTitle || undefined,
              });
            }
          } catch (itemErr) {
            console.warn(`Could not load candidate stats for campaign ${camp.id} (non-critical):`, itemErr);
          }
        });

        await Promise.all(promises);

        // Created by this profile
        const createdCount = campaigns.filter((c) => c.creatorId === user.uid).length;

        setFoundedCount(createdCount);
        setContestedCampaigns(matchingContests.sort((a,b) => b.voteCount - a.voteCount));
        setTotalVotes(cumVotes);
        setCrownsCount(cumCrowns);
      } catch (err) {
        console.error("Error aggregating contestant statistics:", err);
        handleFirestoreError(err, OperationType.GET, `campaigns/*/candidates/${user.uid}`);
      } finally {
        setIsLoading(false);
      }
    }

    loadContestedKingdoms();
  }, [campaigns, user.uid]);

  useEffect(() => {
    try {
      const key = `recent_campaigns_${user.uid}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const ids = Array.from(new Set(JSON.parse(stored)));
        const matches = ids.map((id: string) => campaigns.find(c => c.id === id)).filter(Boolean) as Campaign[];
        setRecentCampaigns(matches);
      }
    } catch(e) {}
  }, [user.uid, campaigns]);

  return (
    <div 
      ref={containerRef}
      id="profile-screen-container"
      className="fixed top-[73px] bottom-[65px] left-0 right-0 z-30 bg-[#fcfcfd] dark:bg-[#0b0f19] w-full h-[calc(100dvh-73px-65px)] overflow-y-scroll snap-y snap-mandatory no-scrollbar font-sans selection:bg-amber-100 selection:text-amber-900"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        #profile-screen-container::-webkit-scrollbar,
        #profile-screen-container *::-webkit-scrollbar {
          display: none !important;
        }
        #profile-screen-container {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        #profile-screen-container * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
      `}</style>
      {/* Floating Return Navigation */}
      {!isOwnProfile && onBack && (
        <button
          onClick={onBack}
          className="fixed top-24 left-4 sm:left-8 z-40 flex items-center justify-center w-10 h-10 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-250 shadow-sm transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
          title="Return"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        </button>
      )}

      {/* SECTION 1: HEADER & STATS */}
      <section id="section-0" className="w-full h-full snap-start flex flex-col justify-between px-4 shrink-0 pt-4 pb-2 overflow-hidden">
        <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-between relative h-full">
          <div className="w-full flex flex-col justify-start gap-3 sm:gap-4">
          
      {/* Profile summary block wrapped for tight spacing */}
      <div className={`flex flex-col gap-1 items-center w-full ${!isOwnProfile && onBack ? "pt-16 sm:pt-12" : ""}`}>
        {/* Profile summary header is ALWAYS visible now */}
        <div className="bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4 relative overflow-hidden max-w-sm sm:max-w-md w-full">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img
              src={user.photoURL || undefined}
              alt={user.displayName || "G"}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover ring-2 ring-amber-100 shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 ring-2 ring-slate-50 shrink-0 select-none">
              <UserCircle className="w-8 h-8 text-slate-400 stroke-[1.25]" />
            </div>
          )}

          <div className="space-y-0.5 pr-14 text-left">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-display font-black text-base text-slate-950 dark:text-white tracking-tight">
                {user.displayName || "Sovereign Lord"}
              </h2>
              {isGuest && (
                <span className="px-1.5 py-0.5 bg-slate-200/80 dark:bg-slate-700 text-slate-500 font-bold text-[7px] rounded-md tracking-wider uppercase leading-none">
                  GUEST
                </span>
              )}
            </div>
            {isGuest && (
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">
                Temporary ledger account
              </p>
            )}

            {/* Render direct custom bio proclamation on profile card */}
            {(!isOwnProfile && isProfilePrivate) ? (
              <p className="text-xs text-rose-500 italic mt-1 font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3 text-rose-500" />
                This claimant’s proclamations are private
              </p>
            ) : bio ? (
              <p className="text-xs text-slate-600 dark:text-slate-300 italic select-text break-words mt-1 rounded-sm">
                “{bio}”
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 italic select-text mt-1">
                No proclamation written yet.
              </p>
            )}

            {/* Follow Stats */}
            <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <span className="text-slate-800 dark:text-white">{followersCount}</span> Followers
              </div>
              <div className="flex items-center gap-1 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <span className="text-slate-800 dark:text-white">{followingCount}</span> Following
              </div>
            </div>
          </div>

          {!isOwnProfile && auth.currentUser && (
            <button
              onClick={handleFollowRequest}
              disabled={isFollowLoading}
              className={`absolute top-4 right-4 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                followStatus === "accepted" 
                  ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-300"
                  : followStatus === "pending"
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                  : "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20"
              }`}
            >
              {followStatus === "accepted" ? "Following" : followStatus === "pending" ? "Requested" : "Follow"}
            </button>
          )}
        </div>
      </div>

      {/* Profile Actions: Two even-sized bars under the card */}
      {isOwnProfile && (
        <div className="flex gap-2 w-full max-w-sm sm:max-w-md">
          <button
            onClick={() => {
              if (isGuest) {
                setErrorMessage("Guest accounts cannot edit profiles. Please log in.");
                return;
              }
              setEditName(user.displayName || "");
              setEditPhoto(user.photoURL || "");
              setEditBio(bio);
              handleSetEditing(true);
            }}
            className="flex-1 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-500 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Profile
          </button>
          
          {onOpenNotifications && (
            <button
              onClick={onOpenNotifications}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm relative"
            >
              <Bell className="w-3.5 h-3.5" />
              Notifications
            </button>
          )}
        </div>
      )}
      </div>

      {/* Active Campaigns - Grid Layout */}
      {(!isOwnProfile && isProfilePrivate) ? null : (() => {
        const joinedRecentCampaigns = recentCampaigns.filter(rc =>
          contestedCampaigns.some(s => s.campaignId === rc.id)
        );
        const activeCampaignList = (isOwnProfile && !isGuest && joinedRecentCampaigns.length > 0)
          ? joinedRecentCampaigns
          : contestedCampaigns.map(s => campaigns.find(c => c.id === s.campaignId)).filter(Boolean) as Campaign[];

        return (
          <div className="space-y-4 pt-2 w-full max-w-5xl mx-auto px-1">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-slate-900 dark:text-slate-200 text-xs tracking-widest uppercase flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                Active Campaigns
              </h3>
            </div>

            {isLoading ? (
              <div className="p-8 text-center bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-500 rounded-2xl text-slate-500 dark:text-slate-300 text-xs shadow-sm">
                Synchronizing campaign records...
              </div>
            ) : activeCampaignList.length === 0 ? (
              <div className="p-10 text-center bg-slate-200/40 dark:bg-slate-700 border border-dashed border-slate-400 dark:border-slate-500 rounded-3xl text-slate-500 dark:text-slate-300 text-xs shadow-sm">
                📯 This claimant is not presently active in any known domains.
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 w-full">
                  {Array.from({ length: 6 }).map((_, index) => {
                    if (index === 5) {
                      // Last card: "See All"
                      return (
                        <button
                          key="see-all-grid-card"
                          onClick={() => setShowAllCampaignsModal(true)}
                          className="w-full h-[80px] sm:h-[88px] rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.04] dark:bg-amber-500/[0.02] hover:bg-amber-500/[0.1] hover:border-amber-500/60 transition-all flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer group"
                        >
                          <Layers className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
                          <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block mt-0.5">
                            See All
                          </span>
                          <span className="text-[6.5px] font-bold text-amber-500/60 uppercase tracking-wider block">
                            {activeCampaignList.length} Domains
                          </span>
                        </button>
                      );
                    }

                    if (index < activeCampaignList.length) {
                      const actualCamp = activeCampaignList[index];
                      const stats = contestedCampaigns.find(s => s.campaignId === actualCamp.id);
                      
                      let catEmoji = "🔮";
                      let catLabel = "Misc";
                      if (actualCamp.domainType) {
                        const lower = actualCamp.domainType.toLowerCase();
                        if (lower === "cultures") { catEmoji = "👥"; catLabel = "Cultures"; }
                        else if (lower === "locations" || lower === "places") { catEmoji = "📍"; catLabel = "Locations"; }
                        else if (lower === "objects" || lower === "things") { catEmoji = "📦"; catLabel = "Objects"; }
                        else if (lower === "actions" || lower === "verbs") { catEmoji = "⚡"; catLabel = "Actions"; }
                      }

                      const cleanTitle = actualCamp.domainTitle || "";

                      return (
                        <div
                          key={actualCamp.id}
                          onClick={() => onEnterCampaign(actualCamp, user.uid)}
                          className="w-full bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-500 p-1.5 rounded-xl shadow-xs hover:shadow-sm hover:border-amber-400 dark:hover:border-amber-500 transition-all cursor-pointer relative overflow-hidden group flex flex-col justify-between h-[80px] sm:h-[88px]"
                        >
                          <div className="space-y-0.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className="text-[6.5px] font-black px-1 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-500 rounded flex items-center gap-0.5 uppercase tracking-wider border border-slate-300/10">
                                <span>{catEmoji}</span> {catLabel}
                              </span>
                            </div>

                            <div className="text-left leading-none">
                              <span className="text-[7px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-0.5 truncate">
                                {cleanTitle}
                              </span>
                              <h4 className="font-display font-black text-[#0f172a] dark:text-slate-100 text-[8.5px] leading-tight uppercase group-hover:text-[#b45309] dark:group-hover:text-amber-500 transition-colors line-clamp-1">
                                {stats?.campaignTitle || `${user.displayName}'s Campaign`}
                              </h4>
                            </div>
                          </div>

                          <div className="pt-0.5 border-t border-slate-300 dark:border-slate-650 flex items-center justify-center text-[7px]">
                            <div className="flex items-center gap-1 bg-slate-300/20 dark:bg-slate-900/40 px-1 py-0.5 rounded border border-slate-300/10 w-full justify-center">
                              <span className="text-[6.5px] font-medium text-slate-400 uppercase tracking-wider">
                                {stats ? "Standing:" : "Role:"}
                              </span>
                              <span className="font-bold text-slate-750 dark:text-slate-300">
                                {stats ? (
                                  stats.isLeader ? (
                                    <span className="text-amber-500 flex items-center gap-0.5 font-bold uppercase tracking-wide text-[6.5px]">
                                      🏆 Champ
                                    </span>
                                  ) : (
                                    stats.rank > 0 ? `#${stats.rank}` : "UNRANKED"
                                  )
                                ) : (
                                  <span className="text-slate-500 flex items-center gap-0.5 font-bold uppercase tracking-wide text-[6.5px]">
                                    VISITOR
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="absolute -right-6 -bottom-6 w-12 h-12 bg-amber-500/[0.02] rounded-full blur-lg group-hover:bg-amber-500/[0.04] transition-all pointer-events-none" />
                        </div>
                      );
                    }

                    // Empty slots to complete the 3x2 grid
                    return (
                      <div
                        key={`placeholder-${index}`}
                        className="w-full h-[80px] sm:h-[88px] rounded-xl border border-dashed border-slate-300 dark:border-slate-600/50 bg-slate-100/30 dark:bg-slate-800/10 flex flex-col items-center justify-center text-center opacity-40 select-none"
                      >
                        <Sparkles className="w-3 h-3 text-slate-400 dark:text-slate-500 mb-0.5" />
                        <span className="text-[7px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block leading-none">
                          Vacant
                        </span>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </div>
        );
      })()}

      {/* Profile Editing is now a small, scrollable floating screen/modal overlay */}
      {isEditing && createPortal((
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-500 rounded-3xl p-5 shadow-2xl max-w-md w-full relative flex flex-col max-h-[85vh] text-left">
            {/* Top gold line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 rounded-t-3xl" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700/80 mb-3 mt-1 shrink-0">
              <h3 className="font-display font-black text-slate-900 dark:text-white text-xs tracking-widest uppercase flex items-center gap-2">
                <Camera className="w-4.5 h-4.5 text-amber-500" />
                Edit Profile
              </h3>
              <button
                type="button"
                onClick={() => handleSetEditing(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-extrabold text-[10px] uppercase tracking-wider cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Scrollable Container Form */}
            <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin text-left min-h-0 select-text">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Display / Preview Side */}
                <div className="flex flex-col items-center justify-center p-3 bg-slate-200/50 dark:bg-slate-900/30 border border-slate-300/40 dark:border-slate-700 rounded-2xl text-center space-y-2.5">
                  <div className="relative group">
                    {editPhoto ? (
                      <img
                        src={editPhoto}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-2xl object-cover ring-4 ring-amber-100 shadow-sm"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-700 border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                        <UserCircle className="w-10 h-10 text-slate-300 stroke-[1.25]" />
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-950 rounded-lg flex items-center justify-center border border-white text-white">
                      <Camera className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <div className="space-y-0.5 select-none">
                    <span className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-widest block leading-none">
                      {editName || "Sovereign Lord"}
                    </span>
                    <span className="text-[8px] text-slate-400 font-semibold block uppercase tracking-wider mt-1 border-t border-slate-200 dark:border-slate-700 pt-1 leading-none">
                      Preview
                    </span>
                  </div>
                </div>

                {/* Editing Form Inputs Side */}
                <div className="md:col-span-2 space-y-3.5 text-left">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest leading-none">
                      Sovereign Username
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={32}
                        required
                        placeholder="e.g. King Arthur, Lady Jane"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`w-full px-3 py-2 bg-slate-200/60 dark:bg-slate-900/40 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-amber-400/5 transition-all font-medium text-slate-800 dark:text-slate-100 ${
                          isNameTaken ? "border-red-400 focus:border-red-500 focus:ring-red-400/20" : ""
                        }`}
                      />
                      {editName.trim().length > 0 && isNameTaken !== null && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pr-1">
                          {isNameTaken ? (
                            <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                              Taken
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                              <CheckCircle className="w-3 h-3" /> Available
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest leading-none">
                      Crest Picture File
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const { resizeImage } = await import("../utils/image");
                            const b64 = await resizeImage(file, 400, 400, 0.7);
                            setEditPhoto(b64);
                          } catch (err) {
                            console.error("Failed to process image:", err);
                            setErrorMessage("Failed to process image.");
                          }
                        }
                      }}
                      className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 dark:file:bg-amber-900/30 dark:file:text-amber-400 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest leading-none">
                      Royal Proclamation / Bio
                    </label>
                    <textarea
                      maxLength={300}
                      rows={2}
                      placeholder="Proclaim your bio to the realm..."
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-200/60 dark:bg-slate-900/40 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-amber-400/5 transition-all font-medium text-slate-800 dark:text-slate-100 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Preset Royal Crests Grid Selection */}
              <div className="space-y-2.5 pt-1 border-t border-slate-200 dark:border-slate-700/80 text-left">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  Or Choose a Preset Royal Crest
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {PRESET_CREST_AVATARS.map((avatar) => {
                    const isSelected = editPhoto === avatar.url;
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setEditPhoto(avatar.url)}
                        className={`p-1.5 rounded-xl bg-slate-300/60 dark:bg-slate-800/60 border border-slate-400/40 dark:border-slate-600/40 flex flex-col items-center gap-1 transition-all cursor-pointer relative ${
                          isSelected
                            ? "border-amber-500 bg-amber-500/5 ring-4 ring-amber-500/10 scale-[1.03]"
                            : "border-slate-300/40 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                        }`}
                      >
                        <img
                          src={avatar.url}
                          alt={avatar.title}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-lg object-cover shrink-0"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                        <span className="text-[7px] font-bold text-slate-500 text-center leading-none tracking-tight">
                          {avatar.title}
                        </span>
                        {isSelected && (
                          <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-emerald-500 text-white rounded-full flex items-center justify-center border border-white">
                            <Check className="w-1.5 h-1.5 stroke-[3.5]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feedback & Actions Bar */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="h-4 flex items-center">
                  {saveMessage && (
                    <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1 leading-none uppercase tracking-wide">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                      {saveMessage}
                    </span>
                  )}
                  {errorMessage && (
                    <span className="text-[9px] text-rose-600 font-bold flex items-center gap-1 leading-none uppercase tracking-wide">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500 stroke-[2.5]" />
                      {errorMessage}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleSetEditing(false)}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-4 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-100 text-slate-500 font-extrabold text-[9px] uppercase tracking-widest disabled:opacity-50 cursor-pointer h-8 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:w-auto min-w-[100px] px-4 py-1.5 bg-amber-500 hover:bg-amber-600 font-black text-white hover:text-amber-950 text-[9px] uppercase tracking-widest shadow-md shadow-amber-500/10 flex items-center justify-center gap-1 h-8 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Sealing...</span>
                      </>
                    ) : (
                      <>
                        <span>Seal Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}
      {/* User statistics and active campaigns - locked if private and not own profile */}
      {(!isOwnProfile && isProfilePrivate) && (
        <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700 rounded-2xl p-8 text-center max-w-xs sm:max-w-sm mx-auto shadow-sm space-y-3.5 mt-8">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-amber-500 stroke-[2]" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-black text-slate-900 dark:text-white text-[11px] tracking-widest uppercase">
              Profile Sealed
            </h3>
            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              This claimant has chosen to lock their profile under secure seal. Statistics and active thronerooms are hidden.
            </p>
          </div>
        </div>
      )}
      
          </div>

          {/* Smooth scroll down arrow indicator */}
          {(!isOwnProfile && isProfilePrivate) ? null : (
            <div className="flex justify-center pt-2 pb-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('section-1');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex flex-col items-center gap-1 group text-slate-400 hover:text-amber-500 transition-colors duration-200 cursor-pointer"
              >
                <span className="text-[8px] font-mono font-bold tracking-[0.2em] uppercase opacity-75 group-hover:opacity-100">
                  System Analytics
                </span>
                <ChevronDown className="w-4 h-4 animate-bounce text-amber-500/80 group-hover:text-amber-500" />
              </button>
            </div>
          )}
        </div>
      </section>

      {(!isOwnProfile && isProfilePrivate) ? null : (
        <>
        {/* SECTION 2: THE VOTING INDEX */}
        <section id="section-1" className="w-full h-full snap-start flex flex-col justify-start px-4 shrink-0 pt-4 pb-4 overflow-hidden">
           <div className="w-full max-w-3xl mx-auto flex flex-col justify-start gap-4 pb-4 h-full relative">
             
             {/* Smooth scroll up arrow indicator */}
             <div className="flex justify-center pt-2 pb-4">
               <button
                 type="button"
                 onClick={() => {
                   const el = document.getElementById('section-0');
                   el?.scrollIntoView({ behavior: 'smooth' });
                 }}
                 className="flex flex-col items-center gap-1 group text-slate-400 hover:text-amber-500 transition-colors duration-200 cursor-pointer"
               >
                 <ChevronUp className="w-4 h-4 animate-bounce text-amber-500/80 group-hover:text-amber-500" />
                 <span className="text-[8px] font-mono font-bold tracking-[0.2em] uppercase opacity-75 group-hover:opacity-100">
                   Return to Profile
                 </span>
               </button>
             </div>

            {/* User Statistics 4-Quadrant High-Fidelity Spreadsheet Dashboard */}
            <div className="space-y-4">
            <div className="flex items-center gap-1.5 px-0.5">
              <Landmark className="w-4 h-4 text-slate-500" />
              <h3 className="font-display font-extrabold text-slate-800 dark:text-slate-100 text-[10px] uppercase tracking-widest">
                SOVEREIGN EXCHANGE ANALYTICS [ SYSTEM STATISTICS ]
              </h3>
            </div>

            {/* Unified 4-Quadrant Tactical Module */}
            <div className="bg-slate-200 dark:bg-[#030406] border border-slate-400 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="grid grid-cols-2 relative z-0">
                
                {/* Q1: LIVE CANDLESTICK (Top-Left) */}
                <div 
                  onClick={() => setShowQ1Modal(true)}
                  className="rounded-tl-2xl bg-slate-100/90 dark:bg-[#07080b] border-r border-b border-slate-300 dark:border-slate-800 p-3 sm:p-4 flex flex-col justify-between relative overflow-hidden group h-[180px] sm:h-[200px] transition-all duration-300 ease-out transform hover:scale-[1.03] active:scale-[0.975] hover:z-10 hover:shadow-2xl hover:shadow-emerald-500/10 cursor-pointer hover:bg-white dark:hover:bg-[#0e1015] hover:border-emerald-500/30 dark:hover:border-emerald-500/20"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[7px] sm:text-[8px] font-black tracking-widest uppercase text-emerald-500 flex items-center gap-0.5 sm:gap-1">
                        <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-pulse" /> Q1: CANDLESTICKS
                      </span>
                      <h4 className="font-mono text-[9px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">
                        Asset Valuation
                      </h4>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-[11px] sm:text-[13px] font-black text-slate-930 dark:text-white leading-none block">
                        Δ {totalVotes}
                      </span>
                      <span className="text-[6px] sm:text-[7px] text-emerald-500 font-extrabold tracking-tighter uppercase whitespace-nowrap">
                        (+12.4%)
                      </span>
                    </div>
                  </div>

                  {/* SVG Candlestick Compact Mock Rendering */}
                  <div className="flex-1 flex items-end justify-between py-2 h-16 sm:h-20">
                    {[
                      { open: 15, close: 35, high: 45, low: 5, up: true },
                      { open: 35, close: 30, high: 40, low: 20, up: false },
                      { open: 30, close: 50, high: 55, low: 25, up: true },
                      { open: 50, close: 70, high: 75, low: 45, up: true },
                      { open: 70, close: 55, high: 80, low: 50, up: false },
                      { open: 55, close: 85, high: 90, low: 45, up: true },
                    ].map((cand, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center h-full relative group/candle">
                        {/* Price bar line */}
                        <div 
                          className="w-[1px] absolute" 
                          style={{
                            top: `${100 - cand.high}%`,
                            bottom: `${cand.low}%`,
                            backgroundColor: cand.up ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'
                          }}
                        />
                        {/* Candlestick Body */}
                        <div 
                          className="w-4 sm:w-6 rounded-xs absolute z-10"
                          style={{
                            top: `${100 - Math.max(cand.open, cand.close)}%`,
                            bottom: `${Math.min(cand.open, cand.close)}%`,
                            backgroundColor: cand.up ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                            border: cand.up ? '1px solid rgb(16, 185, 129)' : '1px solid rgb(239, 68, 68)'
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between font-mono text-[6px] sm:text-[7px] text-slate-500 dark:text-slate-400 border-t border-slate-300 dark:border-slate-800/60 pt-1">
                    <span className="truncate">MIN: 10V</span>
                    <span className="truncate">VOL: {totalVotes * 12}M/H</span>
                  </div>
                </div>

                {/* Q2: LEADERBOARD VELOCITY INDEX (Top-Right) */}
                <div
                  onClick={() => setShowQ2Leaderboard(true)}
                  className="rounded-tr-2xl bg-slate-100/90 dark:bg-[#07080b] border-b border-slate-300 dark:border-slate-800 p-3 sm:p-4 flex flex-col justify-between relative overflow-hidden group h-[180px] sm:h-[200px] transition-all duration-300 ease-out transform hover:scale-[1.03] active:scale-[0.975] hover:z-10 hover:shadow-2xl hover:shadow-amber-500/10 cursor-pointer hover:bg-white dark:hover:bg-[#0e1015] hover:border-amber-500/30 dark:hover:border-amber-500/20"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[7px] sm:text-[8px] font-black tracking-widest uppercase text-amber-500 flex items-center gap-0.5 sm:gap-1">
                        <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-500 fill-amber-500/10 animate-pulse" /> Q2: LEADERBOARDS
                      </span>
                      <h4 className="font-mono text-[9px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">
                        Sovereign Power
                      </h4>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-[11px] sm:text-[13px] font-black text-slate-933 dark:text-white leading-none block">
                        {crownsCount} Domains
                      </span>
                      <span className="text-[6px] sm:text-[7px] text-amber-500 font-extrabold tracking-tighter uppercase whitespace-nowrap block">
                        {contestedCampaigns.length} ACTIVE BOARDS
                      </span>
                    </div>
                  </div>

                  {/* Compact Mini Leaderboard Live Animation */}
                  <div className="flex-1 flex flex-col justify-center py-1 h-16 sm:h-20 overflow-hidden">
                    <Q2LeaderboardLiveAnimation />
                  </div>

                  <div className="flex justify-between font-mono text-[6px] sm:text-[7px] text-slate-500 dark:text-slate-400 border-t border-slate-300 dark:border-slate-800/60 pt-1">
                    <span>EXPLORE STANDINGS</span>
                    <span>SCORE: {crownsCount * 100 + totalVotes * 5}</span>
                  </div>
                </div>

                {/* Q3: STOCK MARKET TREND GRAPH (Bottom-Left) */}
                <div
                  onClick={() => setShowDrillDown(true)}
                  className="rounded-bl-2xl bg-slate-100/90 dark:bg-[#07080b] border-r border-b border-slate-300 dark:border-slate-800 p-3 sm:p-4 flex flex-col justify-between relative overflow-hidden group h-[180px] sm:h-[200px] transition-all duration-300 ease-out transform hover:scale-[1.03] active:scale-[0.975] hover:z-10 hover:shadow-2xl hover:shadow-[#818cf8]/10 cursor-pointer hover:bg-white dark:hover:bg-[#0e1015] hover:border-[#818cf8]/35 dark:hover:border-[#818cf8]/25"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[7px] sm:text-[8px] font-black tracking-widest uppercase text-[#818cf8] flex items-center gap-0.5 sm:gap-1">
                        <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#818cf8]" /> Q3: VOTING INDEX
                      </span>
                      <h4 className="font-mono text-[9px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">
                        Sovereign weight
                      </h4>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-[11px] sm:text-[13px] font-black text-slate-933 dark:text-white leading-none block">
                        {votingIndexLoading ? "..." : overviewTotal}
                      </span>
                      <span className="text-[6px] sm:text-[7px] text-[#818cf8] font-extrabold tracking-tighter uppercase whitespace-nowrap block">
                        {votingIndexLoading ? "SYNCING..." : `+${overviewDeltaAbs} (+${overviewDeltaPct.toFixed(1)}%)`}
                      </span>
                    </div>
                  </div>

                  {/* Real VotingIndexChart or Loader */}
                  <div className="flex-1 flex flex-col justify-center py-1 h-16 sm:h-20">
                    {votingIndexLoading ? (
                      <div className="flex flex-col items-center justify-center h-full">
                        <RefreshCw className="w-4.5 h-4.5 text-[#818cf8] animate-spin mb-1 opacity-60" />
                        <span className="text-[6px] uppercase font-mono tracking-widest text-slate-400">Loading ledger...</span>
                      </div>
                    ) : (
                      <VotingIndexChart points={overviewPoints} isUp={overviewIsUp} />
                    )}
                  </div>

                  <div className="flex justify-between font-mono text-[6px] sm:text-[7px] text-slate-500 dark:text-slate-400 border-t border-slate-300 dark:border-slate-800/60 pt-1">
                    <span>EXPLORE LEDGER</span>
                    <span>RESOLUTION: 30D</span>
                  </div>
                </div>

                {/* Q4: WORLD MAP TACTICAL COORDINATES (Bottom-Right) */}
                <div onClick={() => setShowDominionMap(true)} className="rounded-br-2xl bg-slate-100/90 dark:bg-[#07080b] p-3 sm:p-4 flex flex-col justify-between relative overflow-hidden group h-[180px] sm:h-[200px] transition-all duration-300 ease-out transform hover:scale-[1.03] active:scale-[0.975] hover:z-10 hover:shadow-2xl hover:shadow-amber-500/10 cursor-pointer hover:bg-white dark:hover:bg-[#0e1015] hover:border-amber-550/30 dark:hover:border-amber-550/20">
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[7px] sm:text-[8px] font-black tracking-widest uppercase text-amber-500 flex items-center gap-0.5 sm:gap-1">
                        <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-500" /> Q4: DOMINION MAP
                      </span>
                      <h4 className="font-mono text-[9px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">
                        Tactical Coordinates
                      </h4>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-[11px] sm:text-[13px] font-black text-rose-500 leading-none block">
                        GRID
                      </span>
                      <span className="text-[6px] sm:text-[7px] text-rose-500 font-extrabold tracking-tighter uppercase whitespace-nowrap block animate-pulse">
                        LIVE RADAR
                      </span>
                    </div>
                  </div>

                  {/* Compact schematic dot map and radar representation - Spinning Globe with Heat Signatures */}
                  <div className="flex-1 flex justify-center items-center relative h-16 sm:h-20 overflow-hidden py-1">
                    <div className="absolute inset-0 bg-[radial-gradient(#334155_0.5px,transparent_0.5px)] [background-size:5px_5px] opacity-15 dark:opacity-35" />
                    
                    {/* The Globe Sphere */}
                    <div className="absolute w-14 h-14 rounded-full border border-slate-300/40 dark:border-slate-700 overflow-hidden bg-slate-900/10 dark:bg-slate-900/50 shadow-inner">
                      {/* Lat/Lon grid approximations */}
                      <div className="absolute inset-0 border border-slate-500/20 rounded-full scale-y-50 animate-spin" style={{ animationDuration: '30s' }} />
                      <div className="absolute inset-0 border border-slate-500/20 rounded-full scale-x-50 animate-spin" style={{ animationDuration: '30s' }} />

                      {/* Spinning Heat Signatures */}
                      <div className="w-full h-full relative animate-spin" style={{ animationDuration: '12s', animationTimingFunction: 'linear' }}>
                        {/* Heat point 1 */}
                        <div className="absolute top-2 left-3 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.6)] animate-pulse" />
                        {/* Heat point 2 */}
                        <div className="absolute top-8 left-10 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_3px_rgba(245,158,11,0.7)] animate-pulse" style={{ animationDelay: '0.5s' }} />
                        {/* Heat point 3 */}
                        <div className="absolute top-10 left-2 w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_2px_rgba(244,63,94,0.6)] animate-pulse" style={{ animationDelay: '1s' }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between font-mono text-[6px] sm:text-[7px] text-slate-500 dark:text-slate-400 border-t border-slate-300 dark:border-slate-800/60 pt-1">
                    <span>XY: [883-92]</span>
                    <span>RANGE: 100%</span>
                  </div>
                </div>

              </div>
            </div>
           </div>
         </div>
      </section>
        </>
      )}

      {/* PORTAL FOR ALL MODALS TO BREAK OUT OF STACKING CONTEXT */}
      {createPortal(
        <>
          {/* ALL CAMPAIGNS MODAL */}
      {showAllCampaignsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl select-none text-left animate-fade-in">
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-2xl max-w-4xl w-full relative flex flex-col h-[85vh] overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 rounded-t-3xl" />
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80 mb-4 mt-2 shrink-0">
              <div className="space-y-0.5">
                <h3 className="font-display font-black text-slate-900 dark:text-white text-sm sm:text-base tracking-widest uppercase flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-500 animate-pulse" />
                  Sovereign Campaign Catalog
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wide">
                  Categorized domain registers under current authority
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllCampaignsModal(false)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-extrabold text-[10px] uppercase tracking-wider cursor-pointer bg-slate-200 dark:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 transition-all hover:scale-105 active:scale-95"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 pb-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {(() => {
                const joinedRecentCampaigns = recentCampaigns.filter(rc =>
                  contestedCampaigns.some(s => s.campaignId === rc.id)
                );
                const activeCampaignList = (isOwnProfile && !isGuest && joinedRecentCampaigns.length > 0)
                  ? joinedRecentCampaigns
                  : contestedCampaigns.map(s => campaigns.find(c => c.id === s.campaignId)).filter(Boolean) as Campaign[];

                const catalogCategories = [
                  { id: "locations", label: "Locations", emoji: "📍" },
                  { id: "objects", label: "Objects", emoji: "📦" },
                  { id: "actions", label: "Actions", emoji: "⚡" },
                  { id: "cultures", label: "Cultures", emoji: "👥" },
                  { id: "misc", label: "Miscellaneous", emoji: "🔮" },
                ];

                return catalogCategories.map((cat) => {
                  const filteredList = activeCampaignList.filter((actualCamp) => {
                    if (!actualCamp.domainType) return cat.id === "misc";
                    const lower = actualCamp.domainType.toLowerCase();
                    if (lower === "cultures") return cat.id === "cultures";
                    if (lower === "locations" || lower === "places") return cat.id === "locations";
                    if (lower === "objects" || lower === "things") return cat.id === "objects";
                    if (lower === "actions" || lower === "verbs") return cat.id === "actions";
                    return cat.id === "misc";
                  });

                  return (
                    <div key={cat.id} className="space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="font-display font-black text-xs sm:text-sm tracking-widest text-slate-800 dark:text-slate-250 uppercase flex items-center gap-1.5">
                          <span className="text-sm">{cat.emoji}</span>
                          {cat.label}
                        </h4>
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md border border-slate-300/40 dark:border-slate-750/30">
                          {filteredList.length} {filteredList.length === 1 ? "Domain" : "Domains"}
                        </span>
                      </div>

                      {filteredList.length === 0 ? (
                        <div className="flex overflow-x-auto gap-4 pb-1 w-full scrollbar-none select-none">
                          <div className="w-[180px] shrink-0 border border-dashed border-slate-300 dark:border-slate-800/80 rounded-2xl py-5 px-3 flex flex-col items-center justify-center text-center opacity-45 bg-slate-200/20 dark:bg-slate-900/10">
                            <Sparkles className="w-4 h-4 text-slate-400 dark:text-slate-500 mb-1" />
                            <span className="text-[8px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                              Vacant Class
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex overflow-x-auto gap-3.5 pb-2.5 px-0.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {filteredList.map((actualCamp) => {
                            const stats = contestedCampaigns.find(s => s.campaignId === actualCamp.id);
                            const cleanTitle = actualCamp.domainTitle || "";

                            return (
                              <div
                                key={actualCamp.id}
                                onClick={() => {
                                  setShowAllCampaignsModal(false);
                                  onEnterCampaign(actualCamp, user.uid);
                                }}
                                className="w-[180px] sm:w-[200px] shrink-0 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-750 p-3 rounded-2xl space-y-2 shadow-xs hover:shadow-md transition-all hover:scale-[1.01] hover:border-amber-400 dark:hover:border-amber-500 cursor-pointer flex flex-col justify-between h-[115px] relative overflow-hidden group"
                              >
                                <div className="space-y-1 text-left relative z-10">
                                  <span className="text-[8px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block truncate max-w-[150px]">
                                    {cleanTitle}
                                  </span>
                                  <h4 className="font-display font-black text-slate-800 dark:text-slate-100 text-[10px] leading-tight uppercase group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                                    {stats?.campaignTitle || `${user.displayName}'s Campaign`}
                                  </h4>
                                </div>

                                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[8px] font-mono relative z-10">
                                  <span className="text-slate-400 text-[7px] uppercase tracking-wider">Standing:</span>
                                  {stats ? (
                                    stats.isLeader ? (
                                      <span className="text-amber-500 flex items-center gap-0.5 font-black uppercase text-[8px] tracking-wide">
                                        🏆 Champ
                                      </span>
                                    ) : (
                                      <span className="font-bold text-slate-600 dark:text-slate-300">
                                        {stats.rank > 0 ? `#${stats.rank}` : "UNRANKED"}
                                      </span>
                                    )
                                  ) : (
                                    <span className="font-bold text-slate-400 text-[8px]">
                                      VISITOR
                                    </span>
                                  )}
                                </div>

                                {/* Beautiful subtle gradient circle decorative bg */}
                                <div className="absolute -right-6 -bottom-6 w-12 h-12 bg-amber-500/[0.01] group-hover:bg-amber-500/[0.03] rounded-full blur-lg transition-all pointer-events-none" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Sovereign Campaign Ledger Explorer Drilldown Modal */}
      {showDrillDown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030406]/85 backdrop-blur-md select-none text-left animate-fade-in">
          <div className="bg-[#07080b] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-2xl w-full relative flex flex-col max-h-[90vh]">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-t-3xl" />
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-900 mt-1 shrink-0">
              <div className="space-y-0.5">
                <h3 className="font-display font-black text-white text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                  Sovereign Campaign Ledger Explorer
                </h3>
                <p className="text-[10px] text-slate-400 font-mono uppercase">Votation velocity indices & transition logs</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDrillDown(false);
                  setSelectedCampaignId(undefined);
                }}
                className="text-slate-400 hover:text-white font-mono text-[10px] uppercase tracking-wider cursor-pointer border border-slate-800 hover:border-slate-700 bg-slate-950 px-2.5 py-1 rounded-xl transition-all"
              >
                ✕ Escape
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-5 scrollbar-thin">
              {/* Toggles and filters row */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0d0f14] border border-slate-900 p-3.5 rounded-2xl">
                {/* Domain Selector */}
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                    Scope dominion target
                  </label>
                  <select
                    value={selectedCampaignId || ""}
                    onChange={(e) => setSelectedCampaignId(e.target.value ? e.target.value : undefined)}
                    className="w-full sm:w-auto bg-slate-950 border border-slate-850 focus:border-indigo-400 text-slate-100 px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase focus:outline-none cursor-pointer"
                  >
                    <option value="">All Domains Combined</option>
                    {contestedCampaigns.map((cc) => (
                      <option key={cc.campaignId} value={cc.campaignId}>
                        {cc.domainTitle}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Period Selector */}
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="block text-[8px] font-black text-purple-400 uppercase tracking-widest sm:text-right">
                    Timeline resolution window
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 flex-wrap rounded-xl border border-slate-850">
                    {[
                      { label: "1D", days: 1 },
                      { label: "1W", days: 7 },
                      { label: "1M", days: 30 },
                      { label: "1Y", days: 365 },
                      { label: "5Y", days: 1825 }
                    ].map((d) => (
                      <button
                        key={d.label}
                        type="button"
                        onClick={() => setSelectedDays(d.days)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[9px] uppercase tracking-wide font-black transition-all cursor-pointer ${
                          selectedDays === d.days
                            ? "bg-indigo-600 font-bold text-white shadow-xs"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Loader or Chart */}
              <div className="bg-[#030406] border border-slate-900 rounded-2xl p-4 min-h-[220px] flex flex-col justify-between relative overflow-hidden">
                <div className="flex justify-between items-start mb-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[7px] font-mono tracking-widest uppercase text-indigo-400 font-bold">
                      VELOCITY INDEX
                    </span>
                    <h4 className="font-mono text-[9px] font-bold text-slate-400 uppercase">
                      Cumulative weight over time
                    </h4>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[12px] font-black text-white leading-none block">
                      Index total: {modalTotal}
                    </span>
                    <span className="text-[7px] text-emerald-400 font-bold tracking-tight uppercase block mt-0.5">
                      +{modalDeltaAbs} votes (+{modalDeltaPct.toFixed(1)}%) in this period
                    </span>
                  </div>
                </div>

                {modalLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-10">
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mb-1.5" />
                    <span className="text-[8px] uppercase font-mono tracking-widest text-slate-400">Syncing ledger records...</span>
                  </div>
                ) : (
                  <VotingIndexChart points={modalPoints} isUp={modalIsUp} />
                )}
              </div>

              {/* Transactions list */}
              <div className="space-y-2">
                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest px-0.5">
                  HISTORICAL TRANSACTION ACCOUNTING
                </span>
                <div className="border border-slate-900 rounded-2xl overflow-hidden bg-[#030406]/60">
                  <div className="grid grid-cols-3 bg-slate-950 px-3 py-2 border-b border-slate-900 text-[8px] font-black text-slate-400 font-mono tracking-widest uppercase">
                    <span>Date stamp</span>
                    <span className="text-center">New votes</span>
                    <span className="text-right">Cumulative index</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-900/40 font-mono text-[10px]">
                    {!modalLoading && modalPoints.filter((p) => p.count > 0).length === 0 ? (
                      <div className="p-5 text-center text-slate-500 font-bold uppercase text-[8px]">
                        [ No transition occurrences during this window ]
                      </div>
                    ) : (
                      modalPoints
                        .filter((p) => p.count > 0)
                        .reverse()
                        .map((pt) => (
                          <div key={pt.date} className="grid grid-cols-3 px-3 py-2 text-slate-300 hover:bg-[#07080b] transition-colors items-center select-text">
                            <span className="text-slate-400">{pt.date}</span>
                            <span className="text-center text-emerald-400 font-black">+{pt.count}</span>
                            <span className="text-right font-black text-white">{pt.cumulative}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Q2: LEADERBOARD OVERLAY MODAL */}
      {showQ2Leaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#030406]/85 backdrop-blur-md select-none text-left animate-fade-in">
          <div className="bg-[#07080b] border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl max-w-4xl w-full relative flex flex-col max-h-[92vh]">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 rounded-t-3xl" />
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-900 mt-1 shrink-0">
              <div className="space-y-0.5">
                <h3 className="font-display font-black text-white text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500 animate-pulse" />
                  Sovereign Leaderboards
                </h3>
                <p className="text-[10px] text-slate-400 font-mono uppercase font-bold">Global rankings of domain claimants & powers held</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQ2Leaderboard(false);
                }}
                className="text-slate-400 hover:text-white font-mono text-[10px] uppercase tracking-wider cursor-pointer border border-slate-800 hover:border-slate-700 bg-slate-950 px-2.5 py-1 rounded-xl transition-all"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 py-4 scrollbar-thin">
              <div className="bg-[#0d0f14]/55 border border-slate-900 rounded-2xl p-2 sm:p-4">
                <LeaderboardScreen
                  campaigns={campaigns}
                  currentUserId={user.uid}
                  focusUserId={user.uid}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Q1: CANDLESTICK MAP OVERLAY MODAL */}
      {showQ1Modal && (
        <UserCandlestickModal
          onClose={() => setShowQ1Modal(false)}
          userId={user?.uid}
        />
      )}

          {/* Q4: DOMINION MAP OVERLAY MODAL */}
          {showDominionMap && (
            <DominionMapModal
              onClose={() => setShowDominionMap(false)}
              userId={user.uid}
              userDomains={contestedCampaigns}
            />
          )}
        </>, document.body
      )}
    </div>
  );
}
