import React, { useEffect, useState, useRef, useCallback } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc, updateDoc, collection, addDoc, query, where, getDocs, limit } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Court, CourtMember } from "../types";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { 
  Crown, 
  Users, 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  UserPlus, 
  Link2, 
  Link2Off, 
  Sparkles, 
  Check, 
  Clock, 
  HelpCircle,
  FolderTree,
  ChevronDown,
  Menu,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface KingdomCourtBuilderProps {
  campaignId: string;
  campaignTitle: string;
  userId: string;
  userName: string;
  userPhotoURL: string | null;
  userProfiles: any[];
  isReadonly?: boolean;
  currentAppUserId?: string;
  currentAppUserName?: string;
  currentAppUserPhotoURL?: string | null;
  campaignCreatorId?: string;
}

const EMOJI_AVATARS = ["👑", "🛡️", "🗡️", "🧙‍♂️", "🧝‍♀️", "🦁", "🍷", "📜", "🏰", "🦄", "🌟", "⚔️", "🐉", "🦉"];

export default function KingdomCourtBuilder({
  campaignId,
  campaignTitle,
  userId,
  userName,
  userPhotoURL,
  userProfiles,
  isReadonly = false,
  currentAppUserId,
  currentAppUserName,
  currentAppUserPhotoURL,
  campaignCreatorId,
}: KingdomCourtBuilderProps) {
  const [court, setCourt] = useState<Court | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUserInCampaign, setIsUserInCampaign] = useState<boolean | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  // ID of the node currently opening the character select popover
  const [activeEmojiSelectorId, setActiveEmojiSelectorId] = useState<string | null>(null);
  // ID of the node currently searching for an app user
  const [assigningNodeId, setAssigningNodeId] = useState<string | null>(null);
  const [userSearchText, setUserSearchText] = useState("");
  const [deleteConfirmMemberId, setDeleteConfirmMemberId] = useState<string | null>(null);
  const [isLevelManagerOpen, setIsLevelManagerOpen] = useState(false);
  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);
  const [courtPresets, setCourtPresets] = useState<any[]>([null, null, null]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [chartSearchQuery, setChartSearchQuery] = useState("");
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isTwoFingers, setIsTwoFingers] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [currentScale, setCurrentScale] = useState(1);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);

  const preventNativePropagation = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      const stopProp = (e: Event) => e.stopPropagation();
      el.addEventListener("mousedown", stopProp, { capture: true });
      el.addEventListener("touchstart", stopProp, { capture: true });
      el.addEventListener("click", stopProp, { capture: true });
      el.addEventListener("keydown", stopProp, { capture: true });
    }
  }, []);

  const courtDocPath = `campaigns/${campaignId}/courts/${userId}`;

  // Load court from Firestore
  useEffect(() => {
    setLoading(true);
    const courtDocRef = doc(db, "campaigns", campaignId, "courts", userId);
    const unsubscribe = onSnapshot(
      courtDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Court;
          let healedMembers = [...(data.members || [])];
          let needsHealing = false;

          const hasLeader = healedMembers.some(m => m.userId === userId);
          const rootIndex = healedMembers.findIndex(m => m.id === "root");

          if (!hasLeader || rootIndex === -1) {
            needsHealing = true;
            let cleanedDomain = campaignTitle || "Realm";
            cleanedDomain = cleanedDomain.replace(/^(king|queen)\s+of\s*\.*/i, "").trim();
            
            const properRoot: CourtMember = {
              id: "root",
              parentId: null,
              displayName: userName || "Campaign Leader",
              title: `Sovereign of ${cleanedDomain}`,
              isAppUser: true,
              userId: userId,
              photoURL: userPhotoURL || "👑"
            };

            if (rootIndex !== -1 && healedMembers[rootIndex].userId !== userId) {
              const newId = `healed_${Date.now()}`;
              healedMembers[rootIndex].id = newId;
              healedMembers[rootIndex].parentId = "root";
              
              healedMembers.forEach(m => {
                if (m.parentId === "root" && m.id !== newId) m.parentId = newId;
              });
            }

            healedMembers.forEach(m => {
              if (m.parentId === null && m.id !== "root") {
                m.parentId = "root";
              }
            });

            if (!healedMembers.some(m => m.id === "root")) {
                healedMembers.push(properRoot);
            }
          }

          if (needsHealing) {
             const repairedCourt = { ...data, members: healedMembers };
             setCourt(repairedCourt);
             if (currentAppUserId === userId) {
                setDoc(courtDocRef, repairedCourt).catch(err => console.warn("Auto-heal failed", err));
             }
          } else {
             setCourt(data);
          }
        } else {
          setCourt(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Failed to stream court details: ", err);
        setLoading(false);
        handleFirestoreError(err, OperationType.GET, courtDocPath);
      }
    );

    return () => unsubscribe();
  }, [campaignId, userId]);

  // Check if current user is in campaign
  useEffect(() => {
    if (!currentAppUserId) return;
    if (currentAppUserId === campaignCreatorId) {
      setIsUserInCampaign(true);
      return;
    }
    const checkUserInCampaign = async () => {
      try {
        const courtDocRef = doc(db, "campaigns", campaignId, "courts", userId);
        const courtSnap = await getDoc(courtDocRef);
        if (courtSnap.exists()) {
          const courtData = courtSnap.data() as Court;
          const isMember = courtData.members?.some(m => m.isAppUser && m.userId === currentAppUserId);
          if (isMember) {
            setIsUserInCampaign(true);
            setRequestSent(false);
            return;
          }
        }
        
        const notifsRef = collection(db, "notifications");
        const q = query(
          notifsRef,
          where("sourceUserId", "==", currentAppUserId)
        );
        const notifSnap = await getDocs(q);
        const hasPending = notifSnap.docs.some(doc => {
          const data = doc.data();
          return data.campaignId === campaignId && data.type === "court_join" && data.needsApproval === true;
        });
        if (hasPending) {
          setIsUserInCampaign(false);
          setRequestSent(true);
          return;
        }

        setIsUserInCampaign(false);
        setRequestSent(false);
      } catch (err) {
        console.warn("Failed checking candidate status:", err);
        setIsUserInCampaign(false);
        setRequestSent(false);
      }
    };
    checkUserInCampaign();
  }, [campaignId, currentAppUserId, campaignCreatorId]);

  const handleRequestToJoin = async () => {
    if (!currentAppUserId || !userId || requestSent) return;
    try {
      setSaving(true);
      const notifsRef = collection(db, "notifications");
      await addDoc(notifsRef, {
        userId: userId, // leader of this campaign/court
        sourceUserId: currentAppUserId,
        sourceUserName: currentAppUserName || "A User",
        sourceUserPhoto: currentAppUserPhotoURL || null,
        type: "court_join",
        title: "Court Request",
        body: `${currentAppUserName || "A user"} wants to join your campaign's pedigree chart!`,
        read: false,
        campaignId: campaignId,
        needsApproval: true,
        createdAt: serverTimestamp(),
      });
      setRequestSent(true);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error(err);
      setError("Failed to send request");
    } finally {
      setSaving(false);
    }
  };

  // Clean or normalize campaign title prefix (e.g. "King of Cats" -> "Cats")
  const cleanedDomain = campaignTitle
    ? campaignTitle.replace(/^(king|queen)\s+of\s*\.*/i, "").trim()
    : "Realm";

  // Formulate initial court
  const handleFoundCourt = async () => {
    const courtRef = doc(db, "campaigns", campaignId, "courts", userId);
    try {
      setSaving(true);
      setError(null);
      const initialCourt: Court = {
        userId: userId,
        campaignId: campaignId,
        updatedAt: serverTimestamp() as any,
        members: [
          {
            id: "root",
            parentId: null,
            displayName: userName,
            title: `Sovereign of ${cleanedDomain}`,
            isAppUser: true,
            userId: userId,
            photoURL: userPhotoURL || "👑"
          }
        ]
      };

      await setDoc(courtRef, initialCourt);
      setCourt(initialCourt);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error(err);
      setError("Failed to build the Pedigree Chart in the ledger.");
      handleFirestoreError(err, OperationType.WRITE, courtDocPath);
    } finally {
      setSaving(false);
    }
  };

  // Save the entire court assembly
  const handleSaveCourt = async (inlineCourt: Court) => {
    const courtRef = doc(db, "campaigns", campaignId, "courts", userId);
    try {
      setSaving(true);
      setError(null);
      
      const updatedCourt = {
        ...inlineCourt,
        updatedAt: serverTimestamp() as any
      };

      await setDoc(courtRef, updatedCourt);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error("Save Court error: ", err);
      setError("Failed to save pedigree chart modifications.");
      handleFirestoreError(err, OperationType.WRITE, courtDocPath);
    } finally {
      setSaving(false);
    }
  };

  // Preset Operations
  const fetchPresets = async () => {
    if (!userId) return;
    setLoadingPresets(true);
    try {
      const profileRef = doc(db, "user_profiles", userId);
      const snap = await getDoc(profileRef);
      if (snap.exists()) {
        const data = snap.data();
        const loaded = data.courtPresets || [];
        const padded = [null, null, null];
        loaded.forEach((preset: any, idx: number) => {
          if (preset && idx < 3) {
            padded[idx] = preset;
          }
        });
        setCourtPresets(padded);
      } else {
        setCourtPresets([null, null, null]);
      }
    } catch (err) {
      console.error("Error fetching presets", err);
      setCourtPresets([null, null, null]);
    } finally {
      setLoadingPresets(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchPresets();
    }
  }, [userId, isPresetsExpanded]);

  const handleSavePresetAtIndex = async (idx: number, name: string) => {
    if (!court || !userId) return;
    setSavingPreset(true);
    try {
      const profileRef = doc(db, "user_profiles", userId);
      const newPreset = {
        id: crypto.randomUUID(),
        name: name.trim() || `Preset ${idx + 1}`,
        members: court.members,
      };
      
      const updatedPresets = [...courtPresets];
      while (updatedPresets.length < 3) {
        updatedPresets.push(null);
      }
      updatedPresets[idx] = newPreset;
      
      const finalPresets = updatedPresets.slice(0, 3);
      await updateDoc(profileRef, { courtPresets: finalPresets });
      setCourtPresets(finalPresets);
    } catch (err) {
      console.error("Error saving preset at index", err);
    } finally {
      setSavingPreset(false);
    }
  };

  const handleLoadPreset = (preset: any) => {
    if (!court || !preset || !preset.members) return;
    const nextCourt = {
      ...court,
      members: preset.members,
    };
    setCourt(nextCourt);
    handleSaveCourt(nextCourt);
  };
  
  const handleDeletePreset = async (presetId: string) => {
    if (!userId) return;
    setSavingPreset(true);
    try {
      const profileRef = doc(db, "user_profiles", userId);
      const updatedPresets = courtPresets.map(p => (p && p.id === presetId) ? null : p);
      while (updatedPresets.length < 3) {
        updatedPresets.push(null);
      }
      const finalPresets = updatedPresets.slice(0, 3);
      await updateDoc(profileRef, { courtPresets: finalPresets });
      setCourtPresets(finalPresets);
    } catch (err) {
      console.error("Error deleting preset", err);
    } finally {
      setSavingPreset(false);
    }
  };

  // Node operations helper
  const updateMembersList = (updatedMembers: CourtMember[]) => {
    if (!court) return;
    const nextCourt = {
      ...court,
      members: updatedMembers
    };
    setCourt(nextCourt);
    // Auto-save changes immediately for frictionless design!
    handleSaveCourt(nextCourt);
  };

  // Add a new subordinate
  const handleAddSubordinate = (parentId: string) => {
    if (!court) return;
    const newId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Suggest some realistic vassal titles based on hierarchy depth
    let autoTitle = "Vassal Courtier";
    const level = getNodeDepth(parentId, court.members);
    if (level === 0) {
      autoTitle = "Grand Vizier";
    } else if (level === 1) {
      autoTitle = "High Commander";
    } else if (level === 2) {
      autoTitle = "Royal Sentinel";
    } else {
      autoTitle = "Scribe Messenger";
    }

    const defaultEmoji = EMOJI_AVATARS[Math.floor(Math.random() * EMOJI_AVATARS.length)];

    const newMember: CourtMember = {
      id: newId,
      parentId: parentId,
      displayName: "New Vassal",
      title: autoTitle,
      isAppUser: false,
      userId: null,
      photoURL: defaultEmoji
    };

    updateMembersList([...court.members, newMember]);
  };

  // Trigger deletion choices popover modal
  const handleRemoveMember = (memberId: string) => {
    if (!court) return;
    if (memberId === "root") return;
    setDeleteConfirmMemberId(memberId);
  };

  // Reset/Clear a member's occupant details (keeping the card itself to preserve hierarchy)
  const handleClearMemberData = (memberId: string) => {
    if (!court) return;
    if (memberId === "root") return;

    const updatedMembers = court.members.map((m) => {
      if (m.id === memberId) {
        return {
          ...m,
          displayName: "Vacant Seat",
          isAppUser: false,
          userId: null,
          photoURL: "👤"
        };
      }
      return m;
    });

    updateMembersList(updatedMembers);
    setDeleteConfirmMemberId(null);
  };

  // Delete card: removes current card and shifts its subordinates up to its parent
  const handleDeleteEntireCard = (memberId: string) => {
    if (!court) return;
    if (memberId === "root") return;

    const targetNode = court.members.find(m => m.id === memberId);
    if (!targetNode) return;

    const parentId = targetNode.parentId;

    const updatedMembers = court.members
      .filter((m) => m.id !== memberId)
      .map((m) => {
        if (m.parentId === memberId) {
          return { ...m, parentId: parentId };
        }
        return m;
      });

    updateMembersList(updatedMembers);
    setDeleteConfirmMemberId(null);
  };

  // Delete card and all of its subordinate descendants recursively (Prune Branch)
  const handleDeleteBranch = (memberId: string) => {
    if (!court) return;
    if (memberId === "root") return;

    let idsToRemove = new Set<string>([memberId]);
    let activeSearch = true;
    while (activeSearch) {
      activeSearch = false;
      for (const m of court.members) {
        if (m.parentId && idsToRemove.has(m.parentId) && !idsToRemove.has(m.id)) {
          idsToRemove.add(m.id);
          activeSearch = true;
        }
      }
    }

    const remainingMembers = court.members.filter(m => !idsToRemove.has(m.id));
    updateMembersList(remainingMembers);
    setDeleteConfirmMemberId(null);
  };

  // Insert a new superior post card between current child and parent
  const handleInsertSuperior = (childId: string, currentParentId: string) => {
    if (!court) return;

    const newId = `member_${Date.now()}`;
    const newMember: CourtMember = {
      id: newId,
      parentId: currentParentId,
      displayName: "Vacant Seat",
      title: "New Superior",
      isAppUser: false,
      userId: null,
      photoURL: "👥"
    };

    const childIdx = court.members.findIndex((m) => m.id === childId);

    const updatedMembers = court.members.map((m) => {
      if (m.id === childId) {
        return { ...m, parentId: newId };
      }
      return m;
    });

    if (childIdx !== -1) {
      const copy = [...updatedMembers];
      copy.splice(childIdx, 0, newMember);
      updateMembersList(copy);
    } else {
      updateMembersList([...updatedMembers, newMember]);
    }
  };

  // Update specific node's fields
  const handleUpdateNode = (id: string, updates: Partial<CourtMember>) => {
    if (!court) return;
    const nextMembers = court.members.map((m) => {
      if (m.id === id) {
        return { ...m, ...updates };
      }
      return m;
    });
    updateMembersList(nextMembers);
  };

  // Tree Helper: calculate depth level
  const getNodeDepth = (id: string | null, list: CourtMember[]): number => {
    if (!id) return 0;
    const item = list.find((m) => m.id === id);
    if (!item) return 0;
    if (!item.parentId) return 0; // Root node has depth 0 (Level 1)
    return 1 + getNodeDepth(item.parentId, list);
  };

  const getLevelName = (lvl: number): string => {
    if (lvl === 1) return "Sovereign";
    if (lvl === 2) return "Viceroy / High Council";
    if (lvl === 3) return "Nobles & Officers";
    if (lvl === 4) return "Vassals & Knights";
    return "Honorary Gentry";
  };

  const getMembersByLevel = (): { [key: number]: CourtMember[] } => {
    if (!court) return {};
    const levels: { [key: number]: CourtMember[] } = {};
    court.members.forEach((m) => {
      const depth = getNodeDepth(m.id, court.members);
      const lvl = depth + 1;
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(m);
    });
    return levels;
  };

  const handleDeleteLevel = (levelToDelete: number) => {
    if (!court) return;
    if (levelToDelete <= 1) return; // Cannot delete Sovereign Level

    // 1. Identify which nodes are in this level
    const levelNodes = court.members.filter(m => getNodeDepth(m.id, court.members) + 1 === levelToDelete);
    const levelNodeIds = new Set(levelNodes.map(m => m.id));

    // 2. Map of node ID -> its parent ID (grandparent for children)
    const parentMap: { [nodeId: string]: string | null } = {};
    levelNodes.forEach(m => {
      parentMap[m.id] = m.parentId;
    });

    // 3. Update the list
    const updatedMembers = court.members
      .filter((m) => !levelNodeIds.has(m.id)) // Delete all nodes at this level
      .map((m) => {
        if (m.parentId && levelNodeIds.has(m.parentId)) {
          // Shift child up to grandparent
          return { ...m, parentId: parentMap[m.parentId] };
        }
        return m;
      });

    updateMembersList(updatedMembers);
  };

  // Filter other users matching search characters
  const filteredUsersToAssign = React.useMemo(() => {
    return userSearchText.trim()
      ? userProfiles.filter((p) => {
          const matchesName = p.displayName.toLowerCase().includes(userSearchText.toLowerCase());
          // Avoid self-assignment since user is root
          const isSelf = p.uid === userId;
          // Avoid assigning someone who is already in our court
          const alreadyInCourt = court?.members.some(m => m.userId === p.uid);
          return matchesName && !isSelf && !alreadyInCourt;
        })
      : userProfiles.filter((p) => {
          const isSelf = p.uid === userId;
          const alreadyInCourt = court?.members.some(m => m.userId === p.uid);
          return !isSelf && !alreadyInCourt;
        }).slice(0, 5); // Default display first 5 choices for quick selection
  }, [userSearchText, userProfiles, userId, court]);

  // Find all matched nodes within the pedigree/command tree
  const matchedNodes = React.useMemo(() => {
    return court && chartSearchQuery.trim()
      ? court.members.filter((m) => {
          const query = chartSearchQuery.toLowerCase().trim();
          return (
            m.displayName.toLowerCase().includes(query) ||
            m.title.toLowerCase().includes(query)
          );
        })
      : [];
  }, [court, chartSearchQuery]);

  const handleNextSearchMatch = () => {
    if (matchedNodes.length === 0) return;
    const nextIdx = (currentSearchIndex + 1) % matchedNodes.length;
    setCurrentSearchIndex(nextIdx);
    const targetNode = matchedNodes[nextIdx];
    if (targetNode) {
      const el = document.getElementById(`node-${targetNode.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }
  };

  const handlePrevSearchMatch = () => {
    if (matchedNodes.length === 0) return;
    const prevIdx = (currentSearchIndex - 1 + matchedNodes.length) % matchedNodes.length;
    setCurrentSearchIndex(prevIdx);
    const targetNode = matchedNodes[prevIdx];
    if (targetNode) {
      const el = document.getElementById(`node-${targetNode.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (nodeId: string, idx: number, totalSiblings: number) => {
    if (!court) return null;
    const node = court.members.find((m) => m.id === nodeId);
    if (!node) return null;

    const level = getNodeDepth(node.id, court.members) + 1;

    const isMatched = chartSearchQuery.trim() !== "" && (
      node.displayName.toLowerCase().includes(chartSearchQuery.toLowerCase().trim()) ||
      node.title.toLowerCase().includes(chartSearchQuery.toLowerCase().trim())
    );
    const isCurrentMatch = matchedNodes.length > 0 && matchedNodes[currentSearchIndex]?.id === node.id;

    const children = court.members.filter((m) => m.parentId === nodeId);
    const hasChildren = children.length > 0;
    
    const isFirst = idx === 0;
    const isLast = idx === totalSiblings - 1;

    // Render individual hierarchy branch recursively
    return (
      <div key={node.id} className="flex flex-col items-center relative select-none">
        {/* Top vertical line from parent connector (not needed for root node) with insert superior '+' trigger button */}
        {node.parentId && (
          <div className="relative w-px h-6 bg-slate-200 dark:bg-slate-850 shrink-0 flex items-center justify-center">
            {/* Tiny insert button placed on the connection line */}
            <button
              onClick={() => handleInsertSuperior(node.id, node.parentId!)}
              title="Insert superior card above this post"
              className="absolute w-4 h-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-amber-500 dark:hover:border-amber-400 text-slate-400 hover:text-amber-500 rounded-full flex items-center justify-center transition-all shadow-xs hover:scale-125 z-20 cursor-pointer pointer-events-auto"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
        
        {/* Horizontal connector lines */}
        {node.parentId && totalSiblings > 1 && (
          <div className="absolute top-0 left-0 right-0 flex w-full h-px shrink-0">
            {/* Left side connector segment */}
            <div className={`flex-1 border-t border-slate-200 dark:border-slate-800 ${isFirst ? "invisible" : ""}`} />
            {/* Right side connector segment */}
            <div className={`flex-1 border-t border-slate-200 dark:border-slate-800 ${isLast ? "invisible" : ""}`} />
          </div>
        )}

        {/* PROFILE CARD NODE BOX */}
        <div 
          id={`node-${node.id}`} 
          className={`relative px-3 py-2.5 shrink-0 rounded-xl border w-44 hover:shadow-md transition-all duration-300 text-left flex flex-col gap-1.5 group z-10 ${
            isCurrentMatch
              ? "bg-amber-500/10 dark:bg-amber-500/20 border-amber-550 dark:border-amber-400 ring-2 ring-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.5)] dark:shadow-[0_0_25px_rgba(245,158,11,0.65)] scale-103 z-20 animate-[pulse_2.5s_infinite]"
              : isMatched 
                ? "bg-amber-500/5 dark:bg-amber-500/10 border-amber-500 dark:border-amber-400/80 ring-1 ring-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.2)] dark:shadow-[0_0_16px_rgba(245,158,11,0.35)] scale-101"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-500/40"
          }`}
        >
          
          {/* Card Top Action Bar */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <span className={`text-[6.5px] font-mono font-black uppercase tracking-widest px-1 py-0.5 rounded-sm line-none select-none shrink-0 ${
                node.id === "root" 
                  ? "bg-amber-500/10 text-amber-550 border border-amber-500/10" 
                  : node.isAppUser 
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/10" 
                    : "bg-slate-150 dark:bg-slate-800 text-slate-500/80"
              }`}>
                {node.id === "root" ? "Sovereign" : node.isAppUser ? "App User" : "Vassal"}
              </span>
              <span className="text-[6.5px] font-mono font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1 py-0.5 rounded-sm border border-slate-200/50 dark:border-slate-700/50 shrink-0">
                Lvl {level}
              </span>
              {isMatched && (
                <span className={`text-[6.5px] font-mono font-black uppercase tracking-wider px-1 py-0.5 rounded-sm shrink-0 shadow-2xs ${
                  isCurrentMatch 
                    ? "bg-amber-500 text-white dark:text-slate-950 font-black" 
                    : "bg-amber-500/20 text-amber-600 dark:text-amber-450"
                }`}>
                  {isCurrentMatch ? "FOCUS" : "MATCH"}
                </span>
              )}
            </div>

            {node.id !== "root" && !isReadonly && (
              <button
                onClick={() => handleRemoveMember(node.id)}
                title="Banish member from your pedigree chart"
                className="w-4.5 h-4.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-300 hover:text-rose-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Avatar and Name/Search Section */}
          <div className="flex items-center gap-2">
            {/* Custom Interactive Avatar Sphere */}
            <div className="relative">
              {!node.isAppUser ? (
                // Manual guest custom avatar with click to choose emojis
                <button
                  onClick={() => {
                    if (!isReadonly) {
                      setActiveEmojiSelectorId(activeEmojiSelectorId === node.id ? null : node.id);
                    }
                  }}
                  title={isReadonly ? "" : "Choose dynamic crest icon"}
                  className={`w-8 h-8 rounded-full border border-slate-250 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-lg ${!isReadonly ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'} transition-all text-center select-none`}
                >
                  {node.photoURL || "👤"}
                </button>
              ) : (
                // Real app user picture or fallback crown avatar
                <div className="w-8 h-8 rounded-full border border-slate-250 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden shrink-0 select-none">
                  {node.photoURL && node.photoURL.length > 5 ? (
                    <img src={node.photoURL} alt={node.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-lg">👑</span>
                  )}
                </div>
              )}

              {/* Emoji Choices Popover Floating Box */}
              <AnimatePresence>
                {activeEmojiSelectorId === node.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setActiveEmojiSelectorId(null)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 5 }}
                      className="absolute top-10 left-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 w-44 shadow-lg grid grid-cols-4 gap-1"
                    >
                      {EMOJI_AVATARS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            handleUpdateNode(node.id, { photoURL: emoji });
                            setActiveEmojiSelectorId(null);
                          }}
                          className="w-7 h-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-base select-none cursor-pointer scale-100 transition-transform active:scale-90"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Display Name Input */}
            <div className="flex-1 min-w-0">
              {node.isAppUser ? (
                // Verified user profile is read-only
                <div className="font-display font-semibold text-[11px] text-slate-800 dark:text-slate-100 truncate flex items-center gap-1 select-none pr-1 uppercase">
                  {node.displayName}
                </div>
              ) : (
                // Open editable manual Guest name input
                <input
                  ref={preventNativePropagation}
                  type="text"
                  value={node.displayName}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (!isReadonly) handleUpdateNode(node.id, { displayName: e.target.value });
                  }}
                  readOnly={isReadonly}
                  placeholder="Enter Name..."
                  className={`no-pan select-text w-full px-1 py-0.5 ${isReadonly ? 'bg-transparent border-transparent cursor-default' : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10'} focus:outline-none text-[11px] font-semibold text-slate-800 dark:text-slate-100 rounded transition-all font-display uppercase`}
                />
              )}
            </div>
          </div>

          {/* DESIGNATED TITLE TEXT BOX */}
          <div>
            <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-0.5">
              Designated Title
            </span>
            <input
              ref={preventNativePropagation}
              type="text"
              value={node.title}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onChange={(e) => {
                if (!isReadonly) handleUpdateNode(node.id, { title: e.target.value });
              }}
              readOnly={isReadonly}
              placeholder="e.g. Royal Steward"
              className={`no-pan select-text w-full px-1.5 py-0.5 ${isReadonly ? 'bg-transparent border-transparent cursor-default' : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10'} focus:outline-none text-[10px] font-medium text-slate-800 dark:text-slate-200 rounded transition-all`}
            />
          </div>

          {/* Link / Disconnect app user */}
          <div className={`${isReadonly ? 'hidden' : 'flex'} border-t border-slate-100 dark:border-slate-800/60 pt-1.5 items-center justify-between`}>
            {node.isAppUser ? (
              // Option to unlink the app user
              node.id !== "root" && (
                <button
                  type="button"
                  onClick={() => {
                    handleUpdateNode(node.id, {
                      isAppUser: false,
                      userId: null,
                      photoURL: "👥",
                      displayName: "Vassal Courtier"
                    });
                  }}
                  className="flex items-center gap-1 text-[8.5px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase leading-none cursor-pointer"
                >
                  <Link2Off className="w-2.5" />
                  <span>Unlink User</span>
                </button>
              )
            ) : (
              // Option to search and link an app user
              <button
                type="button"
                onClick={() => {
                  setAssigningNodeId(assigningNodeId === node.id ? null : node.id);
                  setUserSearchText("");
                }}
                className={`flex items-center gap-1 text-[8.5px] font-black uppercase tracking-wider transition-colors leading-none cursor-pointer ${
                  assigningNodeId === node.id ? "text-rose-500" : "text-amber-550 dark:text-amber-400 hover:text-amber-600"
                }`}
              >
                <UserPlus className="w-2.5" />
                <span>{assigningNodeId === node.id ? "Close" : "Assign"}</span>
              </button>
            )}

            {/* Subordinate append trigger */}
            <button
              onClick={() => handleAddSubordinate(node.id)}
              title="Add subordinate courtier beneath this post"
              className="h-4.5 px-1 bg-slate-50 hover:bg-amber-50 hover:text-amber-600 dark:bg-slate-950 dark:hover:bg-amber-950/20 dark:hover:text-amber-400 text-slate-400 rounded border border-slate-150 dark:border-slate-800 flex items-center justify-center transition-all cursor-pointer text-[8.5px] font-mono leading-none gap-0.5 shadow-2xs text-left shrink-0 font-bold"
            >
              <Plus className="w-2 h-2" />
              <span>SUB</span>
            </button>
          </div>

          {/* APP USER SEARCH DROPDOWN SLIDE-IN PANEL */}
          <AnimatePresence>
            {assigningNodeId === node.id && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-t border-slate-100 dark:border-slate-800/80 pt-1.5 flex flex-col gap-1"
              >
                <div className="relative">
                  <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400" />
                  <input
                    ref={preventNativePropagation}
                    type="text"
                    value={userSearchText}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onChange={(e) => setUserSearchText(e.target.value)}
                    placeholder="Search users..."
                    className="no-pan select-text w-full pl-5 pr-1.5 py-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-amber-400 text-[9px] rounded text-slate-800 dark:text-slate-100 font-mono font-semibold"
                  />
                </div>

                {/* Suggestions List */}
                <div className="max-h-20 overflow-y-auto space-y-1 pr-1">
                  {filteredUsersToAssign.length === 0 ? (
                    <div className="text-[8px] text-slate-400 text-center font-mono py-1">
                      No other regents active
                    </div>
                  ) : (
                    filteredUsersToAssign.map((p) => (
                      <button
                        key={p.uid}
                        type="button"
                        onClick={() => {
                          handleUpdateNode(node.id, {
                            isAppUser: true,
                            userId: p.uid,
                            photoURL: p.photoURL || null,
                            displayName: p.displayName
                          });
                          setAssigningNodeId(null);
                          setUserSearchText("");
                        }}
                        className="w-full p-0.5 border border-slate-100 dark:border-slate-850 hover:border-amber-500/20 bg-slate-50 dark:bg-slate-950 hover:bg-amber-50/10 dark:hover:bg-amber-950/10 rounded flex items-center gap-1 text-[8px] font-mono tracking-wider font-extrabold uppercase text-left transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                      >
                        <div className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-150 overflow-hidden shrink-0 flex items-center justify-center">
                          {p.photoURL ? (
                            <img src={p.photoURL || undefined} alt={p.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span>🛡️</span>
                          )}
                        </div>
                        <span className="truncate flex-1">{p.displayName}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Children Subtrees rendered recursively beneath parent vertical connector thread */}
        {hasChildren && (
          <>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-800/80 shrink-0" />
            <div className="flex gap-6 justify-center relative items-start">
              {children.map((child, childIdx) => 
                renderTreeNode(child.id, childIdx, children.length)
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col text-slate-850 dark:text-slate-50 font-sans selection:bg-amber-100 dark:selection:bg-amber-900/30">
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-rose-300 dark:border-rose-950 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Screen Empty State - User hasn't founded a court yet */}
      {!court && !loading ? (
        <div className="text-center py-16 px-6 bg-slate-50/50 dark:bg-slate-900/20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col justify-center items-center gap-5 max-w-xl mx-auto shadow-2xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-500">
            <FolderTree className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md text-center">
            {isReadonly ? (
              <>
                <h3 className="font-display font-bold text-lg md:text-xl text-slate-900 dark:text-white tracking-tight uppercase">
                  No Pedigree Chart
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                  This sovereign has not assembled a royal court yet. Check back later once they have founded their court.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-display font-bold text-lg md:text-xl text-slate-900 dark:text-white tracking-tight uppercase">
                  Build Your Pedigree Chart
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                  Every true regent needs a dedicated council of loyal advisors, champions, and spymasters. Coronated in this domain, you can draft direct and indirect subordinates under your hierarchical rule in a visual family pedigree tree.
                </p>
              </>
            )}
          </div>
          {!isReadonly && (
            <button
              onClick={handleFoundCourt}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 border border-amber-600 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-amber-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
              Found Custom Court
            </button>
          )}
        </div>
      ) : loading ? (
        // Loading skeleton
        <div className="flex flex-col justify-center items-center py-20 gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-amber-250 border-t-amber-500 animate-spin" />
          <span className="font-mono text-[10px] tracking-widest text-slate-400 animate-pulse uppercase">
            Summoning Council Scroll...
          </span>
        </div>
      ) : (
        // ACTIVE INTERACTIVE COURT PEDIGREE CANVAS SCREEN
        <div className="flex flex-col gap-0 w-full h-full min-h-0">
          {/* THE FAMILY TREE / PEDIGREE CHART PANNING CANVAS ENGINE */}
          <TransformWrapper
            initialScale={1}
            minScale={0.3}
            maxScale={2.0}
            limitToBounds={false}
            centerOnInit={true}
            doubleClick={{ disabled: true }}
            onTransformed={(ref) => setCurrentScale(ref.state.scale)}
            onInit={(ref) => setCurrentScale(ref.state.scale)}
            panning={{
              disabled: false,
              excluded: ["no-pan", "input", "textarea", "button", "select"]
            }}
            wheel={{
              disabled: false,
              step: 0.05,
              wheelPanning: true,
            }}
            pinch={{
              disabled: false,
              step: 5,
            }}
          >
            {({ zoomIn, zoomOut, resetTransform, setTransform, state }) => (
              <div 
                onTouchStart={(e) => {
                  if (e.touches.length === 1) e.stopPropagation();
                  else setIsTwoFingers(true);
                }}
                onTouchMove={(e) => {
                  if (e.touches.length === 1) e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  if (e.touches.length === 1) e.stopPropagation();
                  else setIsTwoFingers(false);
                }}
                onTouchCancel={(e) => {
                  if (e.touches.length === 1) e.stopPropagation();
                  else setIsTwoFingers(false);
                }}
                className={`w-full h-full flex-1 min-h-0 relative overflow-hidden bg-slate-50/5 dark:bg-slate-950/5 select-none no-invert-scroll ${
                  isTwoFingers ? "cursor-grabbing touch-none" : "cursor-default touch-auto"
                }`}
              >
                {/* Visual alignment grid guide */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-40 rounded-none" />
                
                {/* 3-Bar Menu Toggle Button */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
                  className="no-pan absolute top-4 left-4 z-30 p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center active:scale-95"
                  title="Toggle Court Control Panel"
                >
                  <Menu className="w-4 h-4" />
                </button>

                {/* Left Side Panel Menu */}
                <AnimatePresence>
                  {isSidePanelOpen && (
                    <motion.div
                      initial={{ x: "-110%", opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: "-110%", opacity: 0 }}
                      transition={{ type: "spring", damping: 25, stiffness: 220 }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="no-pan absolute top-16 left-4 max-h-[82%] w-[96px] sm:w-[105px] bg-white/40 dark:bg-slate-950/30 backdrop-blur-md border border-slate-200/40 dark:border-slate-800/40 z-25 shadow-xl flex flex-col p-1 gap-1 overflow-y-auto select-none rounded-xl animate-fadeIn"
                    >
                      {/* Search Bar Block */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[8px] font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest text-center">Search</span>
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-1 py-0.5 rounded-lg w-full focus-within:border-amber-500 dark:focus-within:border-amber-400 transition-all">
                          <Search className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          <input
                             ref={preventNativePropagation}
                             type="text"
                             value={chartSearchQuery}
                             onMouseDown={(e) => e.stopPropagation()}
                             onTouchStart={(e) => e.stopPropagation()}
                             onChange={(e) => {
                               setChartSearchQuery(e.target.value);
                               setCurrentSearchIndex(0);
                             }}
                             placeholder="Search..."
                             className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-[8px] text-slate-900 dark:text-slate-100 placeholder-slate-400 font-medium flex-1 select-text min-w-0"
                          />
                        </div>
                        {matchedNodes.length > 0 && (
                          <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-1 py-0.5 rounded-lg">
                            <span className="text-[8px] font-mono text-slate-900 dark:text-slate-100 font-bold">
                              {currentSearchIndex + 1}/{matchedNodes.length}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={handlePrevSearchMatch}
                                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 cursor-pointer shrink-0 transition-colors"
                                title="Previous Match"
                              >
                                <ChevronDown className="w-2.5 h-2.5 rotate-90" />
                              </button>
                              <button
                                type="button"
                                onClick={handleNextSearchMatch}
                                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 cursor-pointer shrink-0 transition-colors"
                                title="Next Match"
                              >
                                <ChevronDown className="w-2.5 h-2.5 -rotate-90" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Controls Group */}
                      {court && !isReadonly && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <span className="text-[8px] font-mono font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest text-center">Presets</span>

                          {/* Presets Toggle Button */}
                          <button
                            type="button"
                            onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
                            className={`w-full px-1 py-0.5 rounded-lg border text-[8px] font-mono tracking-wider font-bold uppercase flex items-center justify-center gap-1 cursor-pointer select-none transition-all active:scale-95 shadow-xs ${
                              isPresetsExpanded
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            <Save className="w-3 h-3 shrink-0" />
                            <span>{isPresetsExpanded ? "Hide" : "Presets"}</span>
                          </button>

                          {/* Inline Preset Boxes */}
                          <AnimatePresence>
                            {isPresetsExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col gap-1 overflow-hidden mt-1 pt-1 border-t border-slate-300 dark:border-slate-800"
                              >
                                {[0, 1, 2].map((idx) => {
                                  const preset = courtPresets[idx];
                                  if (preset) {
                                    return (
                                      <div
                                        key={preset.id}
                                        className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-1 shadow-xs"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[8px] font-bold text-slate-900 dark:text-slate-100 truncate leading-tight flex-1">
                                            {preset.name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleDeletePreset(preset.id)}
                                            disabled={savingPreset}
                                            className="text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer disabled:opacity-50 shrink-0"
                                            title="Delete Preset"
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleLoadPreset(preset);
                                          }}
                                          className="w-full py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-mono text-[7px] sm:text-[8px] font-bold uppercase tracking-wider transition-all cursor-pointer text-center active:scale-95 shadow-xs"
                                        >
                                          Load
                                        </button>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div
                                        key={`empty-${idx}`}
                                        className="p-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 flex flex-col gap-1"
                                      >
                                        <input
                                          type="text"
                                          placeholder="Preset label..."
                                          id={`preset-name-input-${idx}`}
                                          ref={preventNativePropagation}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onTouchStart={(e) => e.stopPropagation()}
                                          maxLength={15}
                                          className="w-full px-1 py-0.5 rounded border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-[8px] focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-mono text-center min-w-0"
                                        />
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const inputEl = document.getElementById(`preset-name-input-${idx}`) as HTMLInputElement | null;
                                            const name = inputEl?.value?.trim() || `Preset ${idx + 1}`;
                                            await handleSavePresetAtIndex(idx, name);
                                            if (inputEl) inputEl.value = "";
                                          }}
                                          disabled={savingPreset}
                                          className="w-full py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-mono text-[7px] sm:text-[8px] font-bold uppercase tracking-wider transition-all cursor-pointer text-center active:scale-95 shadow-xs"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    );
                                  }
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Floating Return to King Button (Bottom Right of chart) */}
                <div className="absolute bottom-4 right-4 z-20">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => {
                      resetTransform();
                      setTimeout(() => {
                        const rootCard = document.getElementById("node-root");
                        if (rootCard) {
                          rootCard.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                        }
                      }, 80);
                    }}
                    className="no-pan w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-amber-400 dark:text-amber-300 flex items-center justify-center shadow-lg hover:scale-110 transition-all cursor-pointer border border-blue-500/50"
                    title="Return to King"
                  >
                    <Crown className="w-5 h-5 fill-amber-400 dark:fill-amber-300" />
                  </button>
                </div>

                {/* Floating Zoom Controls */}
                <div className="absolute top-4 right-4 z-20 flex flex-col items-center gap-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md">
                  <button
                    type="button"
                    onClick={() => zoomIn()}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-bold transition-all text-slate-600 dark:text-slate-350 active:scale-95 cursor-pointer"
                    title="Zoom In"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTransform()}
                    className="py-1 px-0.5 text-[8px] leading-none font-mono font-bold tracking-wider text-slate-500 dark:text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all cursor-pointer"
                    title="Reset Zoom & Pan"
                  >
                    {Math.round(currentScale * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomOut()}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-bold transition-all text-slate-600 dark:text-slate-350 active:scale-95 cursor-pointer"
                    title="Zoom Out"
                  >
                    －
                  </button>
                </div>

                {/* Centered Horizontal recursively built branches tree wrap */}
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  wrapperClass="!w-full !h-full"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  <div className="flex flex-col justify-start items-center min-w-max py-10 origin-center">
                    {court && renderTreeNode("root", 0, 1)}
                  </div>
                </TransformComponent>
              </div>
            )}
          </TransformWrapper>
        </div>
      )}

      {/* Dynamic Popover / Delete Decision Dialogue Modal */}
      <AnimatePresence>
        {deleteConfirmMemberId && (() => {
          const targetMember = court?.members.find(m => m.id === deleteConfirmMemberId);
          const hasSubordinates = court?.members.some(m => m.parentId === deleteConfirmMemberId);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDeleteConfirmMemberId(null)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
              />

              {/* Modal Box */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-[280px] p-4 shadow-xl z-10 flex flex-col gap-3 text-center animate-none"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                      Delete Options
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      {targetMember?.displayName || "Member"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => handleClearMemberData(deleteConfirmMemberId)}
                    className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg font-bold font-display text-[9px] uppercase tracking-wider transition-colors text-center cursor-pointer flex items-center justify-center gap-1"
                  >
                    🧹 Clear Data Only
                  </button>

                  {hasSubordinates ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntireCard(deleteConfirmMemberId)}
                        className="w-full px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-450 rounded-lg font-bold font-display text-[9px] uppercase tracking-wider transition-all text-center cursor-pointer flex items-center justify-center gap-1 shadow-2xs border border-rose-500/10"
                      >
                        ⚠️ Delete Card & Shift Subordinates Up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(deleteConfirmMemberId)}
                        className="w-full px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold font-display text-[9px] uppercase tracking-wider transition-colors text-center cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                      >
                        🔥 Prune Card & All Subordinates
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDeleteEntireCard(deleteConfirmMemberId)}
                      className="w-full px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold font-display text-[9px] uppercase tracking-wider transition-colors text-center cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      🔥 Delete Card
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeleteConfirmMemberId(null)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-400 rounded-lg font-bold font-display text-[9px] uppercase tracking-wider transition-colors text-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Sovereignty Layer Authority Modal */}
      <AnimatePresence>
        {isLevelManagerOpen && (() => {
          // Calculate active levels
          const levelsData = getMembersByLevel();
          const activeLevels = Object.keys(levelsData)
            .map(Number)
            .sort((a, b) => a - b);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLevelManagerOpen(false)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-xl z-10 flex flex-col gap-4 text-left font-sans"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-550 dark:text-amber-400 shrink-0" />
                    <div>
                      <h3 className="font-display font-bold text-xs uppercase text-slate-900 dark:text-slate-100 tracking-wider">
                        Layer Authority
                      </h3>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        Manage entire horizontal stack tiers
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsLevelManagerOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 font-bold text-xs shrink-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                  {activeLevels.map((lvl) => {
                    const count = levelsData[lvl]?.length || 0;
                    const isSovereign = lvl === 1;

                    return (
                      <div
                        key={lvl}
                        className="p-3 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between gap-4 hover:border-amber-550/20 transition-all"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-black text-amber-550 dark:text-amber-400">
                              Lvl {lvl}
                            </span>
                            <span className="text-[10px] font-bold text-slate-850 dark:text-slate-200 uppercase">
                              {getLevelName(lvl)}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">
                            {count} occupant{count !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {!isSovereign ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Banish entire Level ${lvl} (${getLevelName(lvl)})? Active next-in-line subordinates will shift up to their superior's grandparent.`)) {
                                handleDeleteLevel(lvl);
                                setIsLevelManagerOpen(false);
                              }
                            }}
                            className="bg-rose-500 hover:bg-rose-600 text-white font-bold font-display text-[8.5px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            Delete Level
                          </button>
                        ) : (
                          <span className="text-[8px] font-mono font-black text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                            Immutable
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[9px] text-slate-400 leading-relaxed font-sans mt-1 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-850/60">
                  🛡️ <strong>Rule of Order:</strong> Deleting a layer completely prunes all nodes on that level. To preserve order without jumbling, children are safely reparented up to Level L-1. Only the Sovereign holds this level pruning key.
                </p>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

    </div>
  );
}
