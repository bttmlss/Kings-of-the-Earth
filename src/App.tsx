/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query, onSnapshot, where, orderBy, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { Campaign } from "./types";
import LoginScreen from "./components/LoginScreen";
import CampaignDetail from "./components/CampaignDetail";
import Feed from "./components/Feed";
import CreateCampaignModal from "./components/CreateCampaignModal";
import CreatePostModal from "./components/CreatePostModal";
import LeaderboardScreen from "./components/LeaderboardScreen";
import ProfileScreen from "./components/ProfileScreen";
import HomeFeed from "./components/HomeFeed";
import { NotificationsScreen } from "./components/NotificationsScreen";
import { Crown, Sparkles, LogOut, Plus, ShieldAlert, Award, Grid, Trophy, User as UserIcon, Settings, Sun, Moon, Scale, FileText, ChevronRight, Home, Menu, Bell, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import PullToRefresh from "./components/PullToRefresh";
import { useGlobalInvertedScroll } from "./hooks/useGlobalInvertedScroll";

export default function App() {
  useGlobalInvertedScroll();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [userProfiles, setUserProfiles] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<{type: 'campaign'|'profile', id: string, timestamp: number, metadata?: any}[]>(() => {
    try {
      const stored = localStorage.getItem("recentVisits");
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return [];
  });

  const addRecentVisit = (type: 'campaign'|'profile', id: string, metadata?: any) => {
    setRecentVisits(prev => {
      const filtered = prev.filter(v => !(v.type === type && v.id === id));
      const next = [{type, id, timestamp: Date.now(), metadata}, ...filtered].slice(0, 10);
      localStorage.setItem("recentVisits", JSON.stringify(next));
      return next;
    });
  };

  const [selectedCampaignRaw, setSelectedCampaignRaw] = useState<Campaign | null>(null);
  const selectedCampaign = selectedCampaignRaw;
  const setSelectedCampaign = (camp: Campaign | null) => {
    if (camp) addRecentVisit("campaign", camp.id, camp);
    setSelectedCampaignRaw(camp);
  };
  
  const [focusedCampaignUserId, setFocusedCampaignUserId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<"home" | "campaign" | "leaderboard" | "profile" | "notifications">("home");
  
  const [viewedUserRaw, setViewedUserRaw] = useState<{ uid: string; displayName: string | null; photoURL?: string | null } | null>(null);
  const viewedUser = viewedUserRaw;
  const setViewedUser = (userProfile: { uid: string; displayName: string | null; photoURL?: string | null } | null) => {
    if (userProfile && userProfile.uid !== user?.uid) addRecentVisit("profile", userProfile.uid, userProfile);
    setViewedUserRaw(userProfile);
  };
  const [isProfilePrivate, setIsProfilePrivate] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setIsProfilePrivate(false);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "user_profiles", user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setIsProfilePrivate(!!snapshot.data().isPrivate);
      } else {
        setIsProfilePrivate(false);
      }
    }, (error) => {
      console.error("Error listening to user profile:", error);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  // Auto-initialize profile in Firestore user_profiles if it doesn't exist
  useEffect(() => {
    if (!user?.uid) return;

    const initProfile = async () => {
      try {
        const userProfileRef = doc(db, "user_profiles", user.uid);
        const snapshot = await getDoc(userProfileRef);
        if (!snapshot.exists()) {
          await setDoc(userProfileRef, {
            userId: user.uid,
            displayName: user.displayName || "Sovereign Player",
            photoURL: user.photoURL || null,
            bio: "",
            isPrivate: false
          }, { merge: true });
        }
      } catch (err) {
        console.warn("Failed auto-initializing user profile in Firestore:", err);
      }
    };

    initProfile();
  }, [user?.uid, user?.displayName, user?.photoURL]);

  const handleTogglePrivacy = async () => {
    if (isGuest) {
      setFeedback("Guest accounts cannot modify privacy settings.");
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    if (!user?.uid) return;
    const newPrivate = !isProfilePrivate;
    setIsProfilePrivate(newPrivate);
    try {
      if (!user) return;
      const userProfileRef = doc(db, "user_profiles", user.uid);
      await updateDoc(userProfileRef, { isPrivate: newPrivate }).catch(async () => {
        // Fallback: create the profile document if it doesn't already exist
        await setDoc(userProfileRef, {
          userId: user.uid,
          displayName: user.displayName || "Sovereign Lord",
          photoURL: user.photoURL || null,
          bio: "",
          isPrivate: newPrivate
        }, { merge: true });
      });

      setFeedback(newPrivate ? "Secret Seal is now ACTIVE!" : "Secret Seal is now DEACTIVATED!");
      setTimeout(() => setFeedback(null), 3500);
    } catch (e) {
      console.error("Error toggling privacy: ", e);
      setIsProfilePrivate(!newPrivate); // revert
    }
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | any>(() => {
    return (localStorage.getItem("sovereign_theme") as "light" | "dark") || "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("sovereign_theme", theme);
  }, [theme]);

  // Stream Auth status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setUser(authUser);
        setAuthLoading(false);
      } else {
        // Fallback to local session if any
        try {
          const rawLocalSession = localStorage.getItem("local_sovereign_session");
          if (rawLocalSession) {
            setUser(JSON.parse(rawLocalSession));
          } else {
            setUser(null);
          }
        } catch (e) {
          console.error("Local session retrieve fail:", e);
          setUser(null);
        }
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Stream Live Campaigns
  useEffect(() => {
    if (!user) return;

    const campaignsColRef = collection(db, "campaigns");
    // Only stream campaigns that are NOT taken_down, ordered by creation date
    const q = query(
      campaignsColRef,
      where("status", "==", "live"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Campaign[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ...d
          } as Campaign);
        });
        setCampaigns(list);
      },
      (error) => {
        // Handle firestore permissions and quota issues gracefully
        console.error("Failed to stream campaigns: ", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Fetch all user profiles for active search matching and cross-referencing (one-time fetch per mount to save heavy read costs)
  useEffect(() => {
    if (!user) return;
    const fetchProfiles = async () => {
      try {
        const snapshot = await getDocs(collection(db, "user_profiles"));
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            uid: docSnap.id,
            displayName: d.displayName || "Sovereign Lord",
            photoURL: d.photoURL || null,
            bio: d.bio || "",
            isPrivate: !!d.isPrivate,
          });
        });
        setUserProfiles(list);
      } catch (err) {
        console.error("Error fetching user profiles:", err);
      }
    };
    fetchProfiles();
  }, [user]);

  // Sync selected campaign if any live updates modify it (e.g. taken down by owner)
  useEffect(() => {
    if (!selectedCampaign) return;
    const current = campaigns.find((c) => c.id === selectedCampaign.id);
    if (!current) {
      // It was taken down or removed, go back
      setSelectedCampaign(null);
    }
  }, [campaigns, selectedCampaign]);


  const isGuest = user?.uid?.startsWith("local_");

  const handleLogout = async () => {
    try {
      setIsSettingsOpen(false);
      localStorage.removeItem("local_sovereign_session");
      await signOut(auth);
      setUser(null);
      setSelectedCampaign(null);
    } catch (err: any) {
      console.error("Signout Error: ", err);
      setIsSettingsOpen(false);
      setUser(null);
      setSelectedCampaign(null);
    }
  };



  const [refreshKey, setRefreshKey] = useState(0);

  const handlePullToRefresh = async () => {
    try {
      // Re-fetch profiles
      const snapshot = await getDocs(collection(db, "user_profiles"));
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          uid: docSnap.id,
          displayName: d.displayName || "Sovereign Lord",
          photoURL: d.photoURL || null,
          bio: d.bio || "",
          isPrivate: !!d.isPrivate,
        });
      });
      setUserProfiles(list);
      setRefreshKey((prev) => prev + 1);
    } catch (e) {
      console.error("Profiles re-sync failed:", e);
    }
    // Artificial physical delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 1200));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] flex flex-col justify-center items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
        <span className="font-display font-semibold text-sm tracking-wide text-slate-500 animate-pulse uppercase">
          Calling Royal Register...
        </span>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={(authUser) => setUser(authUser)} />;
  }

  const isAnyModalOpen = isCreateModalOpen || isCreatePostModalOpen || isSettingsOpen || isLeaderboardModalOpen;

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans antialiased ${
      theme === "dark" 
        ? "bg-[#0b0f19] text-[#f1f5f9]" 
        : "bg-[#fcfcfd] text-[#0f172a]"
    }`}>
      {/* Universal Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b px-6 py-4 flex items-center justify-between transition-colors duration-300 ${
        theme === "dark"
          ? "bg-slate-900/90 border-slate-800 text-white"
          : "bg-white/80 border-slate-100 text-slate-900"
      }`}>
        <div
          onClick={() => {
            setSelectedCampaign(null);
            setCurrentTab("campaign");
          }}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/10 group-hover:scale-105 transition-transform">
            <Crown className="w-5.5 h-5.5 fill-white stroke-[2]" />
          </div>
          <div>
            <h1 className={`font-display font-bold text-base tracking-tight leading-none group-hover:text-amber-500 transition-colors ${
              theme === "dark" ? "text-white" : "text-slate-950"
            }`}>
              Kings of the Earth
            </h1>
            <p className="text-[10px] text-amber-600 font-bold tracking-wider uppercase leading-none mt-1.5 flex items-center gap-1">
              🎮 Sovereign Domain Game
            </p>
          </div>
        </div>

        {/* User Badging */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (isGuest) {
                setFeedback("Guest accounts cannot create campaigns. Please log in.");
                setTimeout(() => setFeedback(null), 3000);
                return;
              }
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[10px] sm:text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Start Campaign</span>
            <span className="sm:hidden">Start</span>
          </button>
          
          <div className="hidden sm:flex flex-col items-end text-right ml-2">
            <div className={`text-xs font-bold leading-normal ${theme === "dark" ? "text-slate-200" : "text-slate-800"}`}>
              {userProfiles.find(p => p.uid === user.uid)?.displayName || user.displayName || "Sovereign Lord"}
            </div>
            <div className="text-[9px] text-amber-500 leading-none uppercase tracking-widest font-bold">
              Active Crest
            </div>
          </div>

          <button
            id="settings-btn"
            onClick={() => setIsSidePanelOpen(true)}
            title="Menu"
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
              theme === "dark"
                ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-amber-400 hover:bg-slate-700/80"
                : "bg-slate-50 border-slate-100 text-slate-500 hover:text-amber-600 hover:bg-amber-50"
            }`}
          >
            <Menu className="w-5 h-5 text-inherit" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-8 pb-32">
        <AnimatePresence mode="wait">
          {currentTab === "home" ? (
            <motion.div
              key="home-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pb-20"
            >
              <PullToRefresh key={refreshKey} onRefresh={handlePullToRefresh}>
                <HomeFeed 
                  currentUser={user} 
                  onViewProfile={(targetedUser) => {
                    setViewedUser(targetedUser);
                    setCurrentTab("profile");
                  }}
                />
              </PullToRefresh>
            </motion.div>
          ) : currentTab === "leaderboard" ? (
            <motion.div
              key="leaderboard-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pb-20"
            >
              <LeaderboardScreen 
                campaigns={campaigns} 
                currentUserId={user.uid} 
                onViewProfile={(targetedUser) => {
                  setViewedUser(targetedUser);
                  setCurrentTab("profile");
                }}
                onModalToggle={setIsLeaderboardModalOpen}
              />
            </motion.div>
          ) : currentTab === "profile" ? (
            <motion.div
              key="profile-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pb-20"
            >
              <ProfileScreen
                user={viewedUser ? {
                  uid: viewedUser.uid,
                  displayName: viewedUser.displayName,
                  email: null,
                  photoURL: viewedUser.photoURL,
                } : {
                  uid: user.uid,
                  displayName: userProfiles.find(p => p.uid === user.uid)?.displayName || user.displayName,
                  email: user.email,
                  photoURL: userProfiles.find(p => p.uid === user.uid)?.photoURL || user.photoURL,
                }}
                campaigns={campaigns}
                onLogout={handleLogout}
                onEnterCampaign={(camp, targetUserId) => {
                  setCurrentTab("campaign");
                  setSelectedCampaign(camp);
                  setFocusedCampaignUserId(targetUserId || null);
                }}
                onProfileUpdate={(updatedUser) => {
                  setUser({
                    ...user,
                    ...updatedUser,
                  } as any);
                }}
                isOwnProfile={viewedUser === null || viewedUser.uid === user.uid}
                onBack={() => setViewedUser(null)}
                onEditingChange={setIsProfileEditing}
                onOpenNotifications={() => setCurrentTab("notifications")}
              />
            </motion.div>
          ) : currentTab === "notifications" ? (
            <motion.div
              key="notifications-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pb-20"
            >
              <NotificationsScreen currentUser={user} />
            </motion.div>
          ) : !selectedCampaign ? (
            <Feed
              campaigns={campaigns}
              user={user}
              userProfiles={userProfiles}
              recentVisits={recentVisits}
              onSelectCampaign={setSelectedCampaign}
              onViewProfile={(targetedUser) => {
                setViewedUser(targetedUser);
                setCurrentTab("profile");
              }}
              theme={theme}
            />
          ) : (
            <motion.div
              key="detail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pb-20 animate-fade-in"
            >
              <CampaignDetail
                campaign={selectedCampaign}
                userId={user.uid}
                userName={userProfiles.find(p => p.uid === user.uid)?.displayName || user.displayName || "Sovereign Player"}
                userPhotoURL={userProfiles.find(p => p.uid === user.uid)?.photoURL || user.photoURL}
                userProfiles={userProfiles}
                onBack={() => {
                  setSelectedCampaign(null);
                  setFocusedCampaignUserId(null);
                }}
                onViewProfile={(targetedUser) => {
                  setViewedUser(targetedUser);
                  setCurrentTab("profile");
                }}
                campaigns={campaigns}
                onSelectCampaign={(newCamp) => setSelectedCampaign(newCamp)}
                initialSelectedCandidateUserId={focusedCampaignUserId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Bottom Navigation Bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md border-t px-6 py-3 transition-all duration-300 shadow-[0_-8px_30px_rgb(0,0,0,0.03)] selection:bg-transparent ${
        theme === "dark" 
          ? "bg-slate-900/90 border-slate-800" 
          : "bg-white/80 border-slate-100/80"
      } ${
        isAnyModalOpen 
          ? "opacity-45 pointer-events-none select-none" 
          : ""
      }`}>
        <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-items-center">
          <button
            onClick={() => {
              if (isAnyModalOpen) return;
              setCurrentTab("home");
              setSelectedCampaign(null);
            }}
            className={`flex flex-col items-center gap-1.25 py-1 text-center transition-all cursor-pointer w-full justify-center ${
              currentTab === "home"
                ? "text-amber-500 scale-105 font-bold"
                : theme === "dark" ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Home className={`w-5 h-5 ${currentTab === "home" ? "fill-amber-500/20" : ""}`} />
            <span className="text-[10px] uppercase tracking-wider font-extrabold leading-none">Home</span>
          </button>

          <button
            onClick={() => {
              if (isAnyModalOpen) return;
              if (currentTab === "campaign") {
                setSelectedCampaign(null);
              } else {
                setCurrentTab("campaign");
              }
            }}
            className={`flex flex-col items-center gap-1.25 py-1 text-center transition-all cursor-pointer w-full justify-center ${
              currentTab === "campaign"
                ? "text-amber-500 scale-105 font-bold"
                : theme === "dark" ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Crown className={`w-5 h-5 ${currentTab === "campaign" ? "fill-amber-500/20" : ""}`} />
            <span className="text-[10px] uppercase tracking-wider font-extrabold leading-none">Browse</span>
          </button>

          <button
            onClick={() => {
              if (isAnyModalOpen) return;
              if (isGuest) {
                setFeedback("Guest accounts cannot publish decrees. Please log in.");
                setTimeout(() => setFeedback(null), 3000);
                return;
              }
              setIsCreatePostModalOpen(true);
            }}
            className="flex flex-col items-center justify-center -mt-2 transition-all cursor-pointer text-slate-400 hover:text-amber-500 hover:scale-110 active:scale-95 w-full"
            title="Publish New Decree"
          >
              <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-[0_2px_10px_rgba(245,158,11,0.25)] hover:bg-amber-400 dark:hover:bg-amber-400 transition-colors">
                <Plus className="w-5 h-5 text-slate-950 stroke-[3]" />
              </div>
              <span className="text-[9px] uppercase tracking-wider font-extrabold leading-none mt-1">Publish</span>
            </button>
 
          <button
            onClick={() => {
              if (isAnyModalOpen) return;
              setCurrentTab("leaderboard");
              setSelectedCampaign(null);
            }}
            className={`flex flex-col items-center gap-1.25 py-1 text-center transition-all cursor-pointer w-full justify-center ${
              currentTab === "leaderboard"
                ? "text-amber-500 scale-105 font-bold"
                : theme === "dark" ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Trophy className={`w-5 h-5 ${currentTab === "leaderboard" ? "fill-amber-500/20" : ""}`} />
            <span className="text-[10px] uppercase tracking-wider font-extrabold leading-none">Rank</span>
          </button>
 
          <button
            onClick={() => {
              if (isAnyModalOpen) return;
              if (currentTab === "profile") {
                setViewedUser(null);
              } else {
                setCurrentTab("profile");
                setSelectedCampaign(null);
              }
            }}
            className={`flex flex-col items-center gap-1.25 py-1 text-center transition-all cursor-pointer w-full justify-center ${
              currentTab === "profile"
                ? "text-amber-500 scale-105 font-bold"
                : theme === "dark" ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <UserIcon className={`w-5 h-5 ${currentTab === "profile" ? "fill-amber-500/20" : ""}`} />
            <span className="text-[10px] uppercase tracking-wider font-extrabold leading-none">Profile</span>
          </button>
        </div>
      </div>

      {/* Fullscreen Interaction Blocker Overlay behind floating screens (z-45) */}
      {isAnyModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 dark:bg-slate-950/65 backdrop-blur-[1.5px] z-45 cursor-default pointer-events-auto select-none" />
      )}



      {/* Campaign Creation Modal popup */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateCampaignModal
            userId={user.uid}
            userName={userProfiles.find(p => p.uid === user.uid)?.displayName || user.displayName || "Sovereign Lord"}
            onClose={() => setIsCreateModalOpen(false)}
            onSuccess={(newCamp) => {
              setIsCreateModalOpen(false);
              setSelectedCampaign(newCamp);
              setFeedback(`Kingdom '${newCamp.domainTitle}' has been coronated successfully!`);
              setTimeout(() => setFeedback(null), 5000);
            }}
          />
        )}
      </AnimatePresence>

      {/* Post Creation Modal popup */}
      <AnimatePresence>
        {isCreatePostModalOpen && (
          <CreatePostModal
            user={{
              ...user,
              displayName: userProfiles.find(p => p.uid === user.uid)?.displayName || user.displayName,
              photoURL: userProfiles.find(p => p.uid === user.uid)?.photoURL || user.photoURL,
            } as any}
            campaigns={campaigns}
            onClose={() => setIsCreatePostModalOpen(false)}
            onSuccess={() => {
              setIsCreatePostModalOpen(false);
              setFeedback("Decree published successfully!");
              setTimeout(() => setFeedback(null), 5000);
            }}
          />
        )}
      </AnimatePresence>

      {/* Side Panel */}
      <AnimatePresence>
        {isSidePanelOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setIsSidePanelOpen(false)}>
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="w-full max-w-sm h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Menu</h2>
                <button
                  onClick={() => setIsSidePanelOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setIsSidePanelOpen(false);
                    setCurrentTab("notifications");
                  }}
                  className="flex items-center gap-3 w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <Bell className="w-5 h-5 text-amber-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Notifications</span>
                </button>
                <button
                  onClick={() => {
                    setIsSidePanelOpen(false);
                    setIsSettingsOpen(true);
                  }}
                  className="flex items-center gap-3 w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <Settings className="w-5 h-5 text-slate-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Settings</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings & Sacred Codex Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg rounded-3xl border border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Gold Top Banner Decorator */}
              <div className="h-1.5 bg-amber-500 w-full shrink-0" />

              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-400 dark:border-slate-500/80 flex items-center justify-between shrink-0 bg-slate-200 dark:bg-slate-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-md">
                    <Settings className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-display font-black text-sm tracking-widest uppercase">
                      Sovereign Settings
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium">Kingdom Prefs & Sacred Codex</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-400 dark:text-slate-300 flex items-center justify-center transition-colors font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-6 text-left">
                {/* 1. Theme Toggler */}
                <div className="space-y-3">
                  <span className="block text-[11px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest">
                    Day / Night Screen Theme
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`px-4 py-3 rounded-2xl border flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        theme === "light"
                          ? "border-amber-500 bg-amber-500/10 text-amber-700 font-extrabold shadow-sm scale-[1.01]"
                          : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400 font-bold bg-slate-50/50 dark:bg-slate-800/40"
                      }`}
                    >
                      <Sun className="w-4 h-4 stroke-[2.5]" />
                      <span className="text-xs uppercase tracking-wider">Castle Sun</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`px-4 py-3 rounded-2xl border flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                        theme === "dark"
                          ? "border-amber-500 bg-amber-500/10 text-amber-400 font-extrabold shadow-sm scale-[1.01]"
                          : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400 font-bold bg-slate-50/50 dark:bg-slate-800/40"
                      }`}
                    >
                      <Moon className="w-4 h-4 stroke-[2.5]" />
                      <span className="text-xs uppercase tracking-wider">Castle Night</span>
                    </button>
                  </div>
                </div>

                {/* Profile Settings */}
                <div className="space-y-3">
                  <span className="block text-[11px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest">
                    Profile Settings
                  </span>
                  <div className="p-4 rounded-2xl border border-slate-400 dark:border-slate-500 text-xs flex flex-col space-y-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    <div>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                          Kingdom Identity (Email)
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 block mt-0.5">
                          {user ? user.email || "Registered Sovereign" : "No active session"}
                        </span>
                      </div>
  
                      <hr className="border-slate-300 dark:border-slate-700 my-1.5" />
  
                      <div>
                        <div className="flex items-center justify-between gap-6">
                          <div className="text-left">
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                              Private Account Seal
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal block max-w-[200px] mt-0.5">
                              Lock bio, statistics, and contested campaigns from other claimants' query scanning.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleTogglePrivacy}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shrink-0 ${
                              isProfilePrivate ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-700"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                isProfilePrivate ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                {/* 2. Terms of Conditions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <span className="block text-[11px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest">
                      The Sacred Sovereign Codex (Terms of Conditions)
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl border border-slate-400 dark:border-slate-500 text-xs leading-relaxed space-y-4 max-h-48 overflow-y-auto bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">I. Dignity of the Applet</p>
                      <p>Sovereigns shall build domain kingdoms in full respect of the common community. Profanity, vulgarity, or harassment inside domains or claimant titles is strictly prohibited.</p>
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">II. Truth in Voting</p>
                      <p>All coronation and support votes must be given of free will. Actions, bots, or script manipulation designed to skew public consensus are forbidden by order of the realm.</p>
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">III. Sovereignty Rights</p>
                      <p>The sovereign founder of a kingdom holds full permissions to display their title and retains the absolute option of domain decommissioning under proper parameters.</p>
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">IV. Privacy of the Seal</p>
                      <p>A registered user's Gmail address is protected with a private encryption seal. Only the person who it belongs to can see it, and it will never be displayed publicly.</p>
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">V. Graceful Absolution</p>
                      <p>Users may retire their active credential session at any point, instantly purging cached session variables on current client browsers.</p>
                    </div>
                  </div>
                </div>

                {/* 3. Session / Logout action */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full py-3 px-4 rounded-xl font-black text-[11px] uppercase tracking-widest bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:border-transparent transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4 stroke-[2.5]" />
                    Retire Session Credentials (Logout)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Feedback Banner */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl flex items-center gap-3 text-xs"
          >
            <Award className="w-5 h-5 text-amber-400" />
            <span>{feedback}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
