import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Users, UserPlus, Crown, ChevronDown, ChevronUp, CheckCircle, Edit3, Image as ImageIcon, X, AlertCircle, Loader2, UploadCloud, BadgeCheck } from "lucide-react";
import { Campaign, Candidate } from "../types";
import KingdomCourtBuilder from "./KingdomCourtBuilder";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, getDocs, onSnapshot, addDoc, serverTimestamp, doc, setDoc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";
import PostCard, { Post } from "./PostCard";
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../lib/cropImage';

interface CandidateCampaignScreenProps {
  campaign: Campaign;
  candidate: Candidate;
  onBack: () => void;
  userId: string;
  userName: string;
  userPhotoURL: string | null;
  userProfiles: any[];
  onVote?: (candidateId: string) => void;
  isCastingVote?: string | null;
}

export default function CandidateCampaignScreen({
  campaign,
  candidate,
  onBack,
  userId,
  userName,
  userPhotoURL,
  userProfiles,
  onVote,
  isCastingVote,
}: CandidateCampaignScreenProps) {
  const [showDetailsPage, setShowDetailsPage] = useState(false);

  const [activeDetailsTab, setActiveDetailsTab] = useState<'info' | 'posts' | 'media'>('info');
  const [editBio, setEditBio] = useState(candidate.bio || "");
  const [editCoverBio, setEditCoverBio] = useState(candidate.bio || "");
  const [isBioFocused, setIsBioFocused] = useState(false);
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const isGuest = userId.startsWith("local_");

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [selectedMediaPost, setSelectedMediaPost] = useState<Post | null>(null);

  useEffect(() => {
    // Log campaign visit for this specific candidate
    if (candidate.userId && candidate.userId !== auth.currentUser?.uid) {
      if (auth.currentUser) {
        auth.currentUser.getIdToken().then(token => {
          fetch("/api/log-campaign-visit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ targetUserId: candidate.userId })
          }).catch(err => console.error("Failed to log candidate campaign visit", err));
        }).catch(() => {});
      } else {
        fetch("/api/log-campaign-visit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ targetUserId: candidate.userId })
        }).catch(err => console.error("Failed to log candidate campaign visit", err));
      }
    }

    let unsubscribe: (() => void) | undefined;
    async function loadPosts() {
      setIsLoadingPosts(true);
      try {
        const postsRef = collection(db, "posts");
        const q = query(
          postsRef,
          where("userId", "==", candidate.userId),
          where("campaignId", "==", campaign.id)
        );
        unsubscribe = onSnapshot(q, (snapshot) => {
          const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
          fetched.sort((a, b) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tB - tA;
          });
          setPosts(fetched);
          setIsLoadingPosts(false);
          
          // Update selected media post if it's currently open
          setSelectedMediaPost(prev => {
            if (!prev) return prev;
            return fetched.find(p => p.id === prev.id) || null;
          });
        }, (error) => {
          console.error("Error loading posts:", error);
          setIsLoadingPosts(false);
        });
      } catch (err) {
        console.error("Error loading posts:", err);
        setIsLoadingPosts(false);
      }
    }
    loadPosts();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [candidate.userId, campaign.id]);

  // Snapping / Scroll state
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Edit details modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(candidate.campaignTitle || candidate.displayName);
  const [editBannerURL, setEditBannerURL] = useState(candidate.bannerURL || "");
  const [editPendingTime, setEditPendingTime] = useState<"none" | "24hours" | "72hours" | "upon_approval">(
    campaign.pendingTime || "24hours"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Cropper states
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropSave = async () => {
    try {
      if (!imageToCrop || !croppedAreaPixels) return;
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setEditBannerURL(croppedImage);
      setImageToCrop(null);
    } catch (e) {
      console.error(e);
      setEditError("Failed to crop image.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setEditError("Please select a valid image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setEditError("Image size must be under 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageToCrop(event.target.result as string);
        setEditError(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      }
    };
    reader.onerror = () => {
      setEditError("Error reading file.");
    };
    reader.readAsDataURL(file);
  };

  const [localCampaignTitle, setLocalCampaignTitle] = useState(candidate.campaignTitle || candidate.displayName);
  const [localBannerURL, setLocalBannerURL] = useState(candidate.bannerURL || "");

  // Update local states when candidate prop changes
  useEffect(() => {
    setLocalCampaignTitle(candidate.campaignTitle || candidate.displayName);
    setLocalBannerURL(candidate.bannerURL || "");
    setEditTitle(candidate.campaignTitle || candidate.displayName);
    setEditBannerURL(candidate.bannerURL || "");
    setEditCoverBio(candidate.bio || "");
    setEditBio(candidate.bio || "");
  }, [candidate]);

  useEffect(() => {
    setEditPendingTime(campaign.pendingTime || "24hours");
  }, [campaign.pendingTime]);

  const scrollToSection = (index: number) => {
    const el = document.getElementById(`section-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) {
      setEditError("Guests cannot edit campaigns.");
      return;
    }
    setIsSaving(true);
    setEditError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/update-candidate-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          campaignTitle: editTitle,
          bannerURL: editBannerURL,
          bio: editCoverBio
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update campaign details");
      }

      if (userId === campaign.creatorId) {
        const settingsRes = await fetch("/api/update-campaign-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            campaignId: campaign.id,
            domainTitle: campaign.domainTitle,
            pendingTime: editPendingTime
          })
        });

        if (!settingsRes.ok) {
          const settingsData = await settingsRes.json();
          throw new Error(settingsData.error || "Failed to update campaign settings");
        }
      }

      setLocalCampaignTitle(editTitle);
      setLocalBannerURL(editBannerURL);
      
      // Mutate passed candidate object so that change is persistent in the parent list
      candidate.campaignTitle = editTitle;
      candidate.bannerURL = editBannerURL;
      candidate.bio = editCoverBio;

      setEditBio(editCoverBio);

      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || "An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBio = async () => {
    if (isGuest) {
      setBioError("Guests cannot edit bios.");
      return;
    }
    setIsSavingBio(true);
    setBioError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/update-candidate-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          bio: editBio
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update bio");
      }
      
      candidate.bio = editBio;
    } catch (err: any) {
      console.error(err);
      setBioError(err.message || "An unexpected error occurred");
    } finally {
      setIsSavingBio(false);
    }
  };

  return (
    <div 
      ref={containerRef}
      id="candidate-campaign-container"
      className="fixed top-[73px] bottom-[65px] left-0 right-0 z-[35] bg-[#fcfcfd] dark:bg-[#0b0f19] w-full h-[calc(100dvh-73px-65px)] overflow-y-scroll snap-y snap-mandatory no-scrollbar font-sans selection:bg-amber-100 selection:text-amber-900"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        #candidate-campaign-container::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
      {showDetailsPage ? (
        <div className="w-full h-full pt-8 px-4 sm:px-8 pb-12 flex flex-col max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setShowDetailsPage(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-display font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Campaign Details
            </h1>
          </div>
          
          <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 font-mono text-xs font-bold uppercase tracking-widest gap-2">
            <button 
              onClick={() => setActiveDetailsTab('info')}
              className={`px-4 py-2.5 border-b-2 transition-all ${activeDetailsTab === 'info' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Info
            </button>
            <button 
              onClick={() => setActiveDetailsTab('posts')}
              className={`px-4 py-2.5 border-b-2 transition-all ${activeDetailsTab === 'posts' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Posts
            </button>
            <button 
              onClick={() => setActiveDetailsTab('media')}
              className={`px-4 py-2.5 border-b-2 transition-all ${activeDetailsTab === 'media' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Media
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-6">
            {activeDetailsTab === 'info' && (
              <div className="w-full text-slate-700 dark:text-slate-300 text-sm md:text-base leading-relaxed">
                {userId === candidate.userId ? (
                  <div className="relative">
                    {bioError && (
                      <div className="text-rose-500 text-xs mb-2">{bioError}</div>
                    )}
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => setIsBioFocused(true)}
                      onBlur={(e) => {
                        setEditBio(e.currentTarget.textContent || "");
                        setIsBioFocused(false);
                      }}
                      onInput={(e) => setEditBio(e.currentTarget.textContent || "")}
                      className="outline-none bg-transparent inline whitespace-pre-wrap focus:ring-2 focus:ring-amber-500/30 rounded p-1 empty:before:content-['Write_your_mission_statement...'] empty:before:text-slate-400 caret-amber-500"
                    >
                      {candidate.bio || ""}
                    </span>
                    {isBioFocused && <span className="blinking-cursor" />}
                    {editBio !== (candidate.bio || "") && (
                      <button
                        onClick={handleSaveBio}
                        disabled={isSavingBio}
                        className="ml-2 inline-flex items-center px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-all shadow-sm cursor-pointer disabled:opacity-50 align-middle"
                      >
                        {isSavingBio ? "..." : "Save"}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{candidate.bio || "No mission statement provided yet."}</p>
                )}
              </div>
            )}

            {activeDetailsTab === 'posts' && (
              <div className="flex flex-col gap-4 mt-6">
                {isLoadingPosts ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
                ) : posts.filter(p => !p.imageUrl).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 font-mono text-xs uppercase tracking-widest mt-12">
                    [ No text posts yet ]
                  </div>
                ) : (
                  posts.filter(p => !p.imageUrl).map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUser={{ uid: userId, displayName: userName }}
                      onViewCampaign={onBack}
                      onDelete={(deletedId) => setPosts(posts.filter(p => p.id !== deletedId))}
                    />
                  ))
                )}
              </div>
            )}

            {activeDetailsTab === 'media' && (
              <div className="mt-6">
                {isLoadingPosts ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
                ) : posts.filter(p => !!p.imageUrl).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 font-mono text-xs uppercase tracking-widest mt-12">
                    [ No media posts yet ]
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {posts.filter(p => !!p.imageUrl).map(post => (
                      <div key={post.id} onClick={() => setSelectedMediaPost(post)} className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity border border-slate-200 dark:border-slate-700 relative group">
                        <img src={post.imageUrl || undefined} alt="Media" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 1: CANDIDATE INFO HERO */}
          <section id="section-0" className="w-full h-full snap-start flex flex-col justify-between px-4 shrink-0 pt-4 pb-2 overflow-hidden">
            <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-between relative h-full">
              <div className="w-full flex flex-col justify-start gap-4 items-center">
                
                {/* Elegant Navigation Bar */}
                <div className="w-full flex items-center justify-start py-1 shrink-0">
                  <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to domain info</span>
                  </button>
                </div>
                
                <div className="w-full bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 flex flex-col relative overflow-hidden shadow-md">
                  {/* Elegant Banner Area */}
                  <div className="w-full h-32 sm:h-48 relative bg-slate-200 dark:bg-slate-950 overflow-hidden shrink-0 border-b border-slate-200 dark:border-slate-800/80">
                    {localBannerURL ? (
                      <img src={localBannerURL || undefined} alt="Campaign banner" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-amber-500/10 via-slate-500/5 to-slate-800/20" />
                    )}
                    
                    {/* Action buttons in top-right of the banner/title box */}
                    <div className="absolute top-3 right-4 z-20 flex gap-2">
                      {userId === candidate.userId && (
                        <button
                          id="edit-campaign-button"
                          onClick={() => {
                            if (isGuest) {
                              setError("Guests cannot edit campaigns. Please log in.");
                              return;
                            }
                            setEditTitle(localCampaignTitle);
                            setEditBannerURL(localBannerURL);
                            setEditCoverBio(candidate.bio || "");
                            setEditPendingTime(campaign.pendingTime || "24hours");
                            setEditError(null);
                            setIsEditModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-amber-400 dark:text-amber-400 hover:text-white text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer backdrop-blur-md shadow-md border border-white/10 hover:scale-105 active:scale-95 transition-all"
                          title="Edit Campaign"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Campaign info details */}
                  <div className="p-5 sm:p-6 pb-12 sm:pb-6 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 relative">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4 z-10 relative -mt-10 sm:-mt-12">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-4 border-white dark:border-slate-900 shadow-md shrink-0 bg-slate-250 dark:bg-slate-800 flex items-center justify-center relative bg-white dark:bg-slate-900">
                        {candidate.photoURL ? (
                          <img src={candidate.photoURL || undefined} alt={candidate.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl">👑</span>
                        )}
                      </div>
                      <div className="text-center sm:text-left space-y-1 pt-2 sm:pt-4">
                        <div className="flex items-center justify-center sm:justify-start gap-1">
                          <div className="text-[10px] sm:text-[11px] font-bold font-mono text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                            {campaign.domainTitle}
                          </div>
                          {campaign.isVerified && (
                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="Verified Location" />
                          )}
                        </div>
                        <hr className="border-slate-250 dark:border-slate-800 my-1.5 w-full max-w-xs mx-auto sm:mx-0" />
                        <h1 className="text-xl sm:text-2xl font-display font-black text-slate-900 dark:text-slate-100 leading-tight uppercase">
                          {localCampaignTitle}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md">
                          {candidate.bio || "A visionary claimant seeking the crown."}
                        </p>
                        <div className="flex items-center justify-center sm:justify-start gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                            <Users className="w-3.5 h-3.5 text-amber-500" />
                            {candidate.voteCount} Votes
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="shrink-0 z-10 relative pt-2 sm:pt-4 flex flex-col sm:flex-row items-center gap-2">
                      {/* Removed internal buttons */}
                    </div>
                  </div>

                  {/* VOTE button positioned at the bottom left corner of the outer campaign cover box */}
                  <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-20 flex items-center gap-2">
                    {userId !== candidate.userId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onVote) onVote(candidate.id);
                        }}
                        disabled={isCastingVote === candidate.id}
                        className="px-6 py-2 rounded-xl font-mono text-[11px] uppercase tracking-widest font-black flex items-center justify-center gap-1.5 transition-all bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20 border border-green-400 dark:border-green-600 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCastingVote === candidate.id ? "VOTING..." : "VOTE"}
                      </button>
                    )}
                  </div>

                  {/* View Details button positioned at the bottom right corner of the outer campaign cover box */}
                  <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20">
                    <button
                      onClick={() => setShowDetailsPage(true)}
                      className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md border border-slate-200 dark:border-slate-700 hover:scale-105 active:scale-95 transition-all"
                      title="View Details"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                      <span>View Details</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Prompt to scroll to Court Builder */}
              <div className="flex justify-center pt-2 pb-2 shrink-0">
                <button
                  onClick={() => scrollToSection(1)}
                  className="flex flex-col items-center gap-1 text-slate-400 hover:text-amber-500 transition-colors duration-200 font-mono text-[9px] uppercase tracking-widest cursor-pointer mt-1"
                >
                  <span>View Court Builder</span>
                  <ChevronDown className="w-4 h-4 text-amber-500 animate-pulse" />
                </button>
              </div>
            </div>
          </section>

          {/* SECTION 2: COURT BUILDER */}
          <section id="section-1" className="w-full h-full snap-start flex flex-col justify-start px-4 shrink-0 pt-4 pb-4 overflow-hidden">
            <div className="w-full max-w-4xl mx-auto flex flex-col justify-start gap-4 pb-4 h-full relative">
              
              {/* Floating Arrow to scroll back up to Candidate Hero */}
              <div className="flex justify-center pt-2 pb-2 shrink-0">
                <button
                  onClick={() => scrollToSection(0)}
                  className="flex flex-col items-center gap-1 text-slate-400 hover:text-amber-500 transition-colors duration-200 font-mono text-[9px] uppercase tracking-widest cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4 text-amber-500 animate-pulse" />
                  <span>Back to Campaign Info</span>
                </button>
              </div>

              {/* Static Outer Box containing Interactive Court Builder */}
              <div className="w-full flex-1 flex flex-col bg-white dark:bg-[#090b11] border border-slate-200 dark:border-slate-800/80 rounded-3xl shadow-sm overflow-hidden min-h-0">
                {/* Inner Interactive court builder graphic fully filling the section box */}
                <div className="flex-1 min-h-0 relative w-full flex flex-col">
                  <KingdomCourtBuilder
                    campaignId={campaign.id}
                    campaignTitle={campaign.domainTitle}
                    userId={candidate.userId}
                    userName={candidate.displayName}
                    userPhotoURL={candidate.photoURL || null}
                    userProfiles={userProfiles}
                    isReadonly={userId !== candidate.userId}
                    currentAppUserId={userId}
                    currentAppUserName={userName}
                    currentAppUserPhotoURL={userPhotoURL}
                    campaignCreatorId={campaign.creatorId}
                  />
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Beautiful Edit Details Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[110] flex justify-center items-start md:items-center bg-slate-900/60 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="my-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl max-w-sm w-full font-sans text-left relative max-h-[85vh] sm:max-h-[90vh] overflow-y-auto scrollbar-thin"
            >
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="font-display font-black text-slate-900 dark:text-white text-base uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-amber-500" />
                Customize Campaign
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 font-mono">
                personalize your claim to the crown
              </p>

              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] flex items-center gap-2 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveChanges} className="space-y-3">
                <div>
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Campaign Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={100}
                    placeholder={`${candidate.displayName}'s Campaign`}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-900 dark:text-white placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-sans"
                  />
                  <div className="flex justify-end text-[8px] font-mono text-slate-400 mt-1 uppercase">
                    {editTitle.length} / 100
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Campaign Bio
                  </label>
                  <textarea
                    value={editCoverBio}
                    onChange={(e) => setEditCoverBio(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Describe your claim to the crown or mission statement..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-900 dark:text-white placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-sans resize-none"
                  />
                  <div className="flex justify-end text-[8px] font-mono text-slate-400 mt-1 uppercase">
                    {editCoverBio.length} / 500
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Campaign Cover Banner
                  </label>
                  
                  {editBannerURL ? (
                    <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 h-20 flex items-center justify-center">
                      <img 
                        src={editBannerURL || undefined} 
                        alt="Banner Preview" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label 
                          htmlFor="banner-upload" 
                          className="px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-900 text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                        >
                          Replace
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditBannerURL("")}
                          className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) processFile(file);
                      }}
                      className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center transition-all h-20 ${
                        isDragging 
                          ? "border-amber-500 bg-amber-500/5" 
                          : "border-slate-250 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-950/10"
                      }`}
                    >
                      <UploadCloud className="w-5 h-5 text-slate-400 dark:text-slate-500 mb-1 animate-pulse" />
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium text-center">
                        Drag image here, or
                      </p>
                      <label 
                        htmlFor="banner-upload" 
                        className="mt-1 px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                      >
                        Browse
                      </label>
                    </div>
                  )}
                  
                  <input
                    type="file"
                    id="banner-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {userId === campaign.creatorId && (
                  <div className="space-y-1 pt-1">
                    <label htmlFor="settingsPendingTime" className="block text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Validation Period
                    </label>
                    <select
                      id="settingsPendingTime"
                      value={editPendingTime}
                      onChange={(e) => setEditPendingTime(e.target.value as any)}
                      disabled={isSaving}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-900 dark:text-white text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-sans cursor-pointer"
                    >
                      <option value="none">None (Instant)</option>
                      <option value="24hours">24 Hours</option>
                      <option value="72hours">72 Hours</option>
                      <option value="upon_approval">Leader Approval Only</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-150 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-md shadow-amber-500/10 flex items-center gap-1.5 transition-all"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Cropper Modal */}
      <AnimatePresence>
        {imageToCrop && (
          <div className="fixed inset-0 z-[150] bg-black/90 flex flex-col items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg h-[60vh] bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="flex-1 relative">
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={2/1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  showGrid={true}
                />
              </div>
              <div className="bg-slate-900 p-4 border-t border-slate-800 flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-24 accent-amber-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setImageToCrop(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCropSave}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-widest shadow-md transition-colors"
                  >
                    Apply Crop
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Media Post Viewer */}
      <AnimatePresence>
        {selectedMediaPost && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedMediaPost(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-xl w-full"
            >
              <div className="absolute -top-12 right-0">
                <button onClick={() => setSelectedMediaPost(null)} className="p-2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <PostCard
                post={selectedMediaPost}
                currentUser={{ uid: userId, displayName: userName }}
                onViewCampaign={onBack}
                onDelete={(deletedId) => {
                  setPosts(posts.filter(p => p.id !== deletedId));
                  setSelectedMediaPost(null);
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
