import React, { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "firebase/auth";
import { motion } from "motion/react";
import { X, Send, Loader2 } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { Campaign } from "../types";

interface CreatePostModalProps {
  user: User;
  campaigns: Campaign[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePostModal({ user, campaigns, onClose, onSuccess }: CreatePostModalProps) {
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showError, showSuccess } = useToast();

  const [userCampaigns, setUserCampaigns] = useState<{ id: string; campaignTitle: string; isOwned: boolean }[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);

  useEffect(() => {
    let isActive = true;

    const fetchUserCampaigns = async () => {
      setIsLoadingCampaigns(true);
      const validCampaigns: { id: string; campaignTitle: string; isOwned: boolean }[] = [];
      
      try {
        for (const c of campaigns) {
          try {
            const candidateRef = doc(db, "campaigns", c.id, "candidates", user.uid);
            const candidateSnap = await getDoc(candidateRef);
            if (candidateSnap.exists()) {
              const data = candidateSnap.data();
              validCampaigns.push({
                id: c.id,
                campaignTitle: data.campaignTitle || `${data.displayName || user.displayName}'s Campaign`,
                isOwned: c.creatorId === user.uid
              });
            }
          } catch (err) {
            console.warn("Failed checking candidate status:", err);
          }
        }
        
        if (isActive) {
          setUserCampaigns(validCampaigns);
          if (validCampaigns.length > 0) {
            setSelectedCampaignId(validCampaigns[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading user campaigns:", err);
      } finally {
        if (isActive) {
          setIsLoadingCampaigns(false);
        }
      }
    };

    fetchUserCampaigns();

    return () => {
      isActive = false;
    };
  }, [campaigns, user.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() || !selectedCampaignId) {
      showError("Please provide a caption and select a campaign.");
      return;
    }

    const selectedCampaign = userCampaigns.find(c => c.id === selectedCampaignId);
    if (!selectedCampaign) {
      showError("Invalid campaign selected.");
      return;
    }

    setIsSubmitting(true);

    try {
      const newPost = {
        userId: user.uid,
        userDisplayName: user.displayName || "Sovereign Lord",
        userPhotoURL: user.photoURL || null,
        caption: caption.trim(),
        imageUrl: imageUrl.trim(),
        likesCount: 0,
        campaignId: selectedCampaign.id,
        campaignTitle: selectedCampaign.campaignTitle,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "posts"), newPost);
      onSuccess();
    } catch (err) {
      console.error("Error creating post:", err);
      showError("Failed to create post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md rounded-3xl border border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-400 dark:border-slate-500 flex justify-between items-center bg-slate-300 dark:bg-slate-800/50">
          <h2 className="font-display font-bold text-lg tracking-tight">New Decree</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">

          {isLoadingCampaigns ? (
            <div className="p-8 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Locating Your Realms...</span>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Campaign</label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={userCampaigns.length === 0}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white disabled:opacity-50"
                >
                  {userCampaigns.length === 0 ? (
                    <option>No campaigns found</option>
                  ) : (
                    userCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.campaignTitle} {c.isOwned ? "(OWNED REALM)" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Image File</label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const { resizeImage } = await import("../utils/image");
                          const b64 = await resizeImage(file, 800, 800, 0.7);
                          setImageUrl(b64);
                        } catch (err) {
                          console.error("Failed to resize image:", err);
                          showError("Failed to process image.");
                        }
                      }
                    }}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 dark:file:bg-amber-900/30 dark:file:text-amber-400 cursor-pointer"
                  />
                </div>
                {imageUrl && (
                  <div className="mt-3 aspect-video w-full rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800">
                    <img src={imageUrl || undefined} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} onLoad={(e) => (e.currentTarget.style.display = "block")} />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Caption</label>
                <textarea
                  required
                  rows={4}
                  placeholder="What decree shall you issue to the kingdom?"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || userCampaigns.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? "Publishing..." : "Publish Decree"}
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}

