import React, { useState } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "firebase/auth";
import { motion } from "motion/react";
import { X, Send } from "lucide-react";
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
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns.length > 0 ? campaigns[0].id : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() || !selectedCampaignId) {
      setError("Please provide a caption and select a campaign.");
      return;
    }

    const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
    if (!selectedCampaign) {
      setError("Invalid campaign selected.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Validate that the user is in the campaign pedigree
      let inPedigree = user.uid === selectedCampaign.creatorId;
      
      if (!inPedigree) {
        const candidateRef = doc(db, "campaigns", selectedCampaign.id, "candidates", user.uid);
        const candidateSnap = await getDoc(candidateRef);
        if (candidateSnap.exists()) {
          inPedigree = true;
        }
      }

      if (!inPedigree) {
        const courtsRef = collection(db, "campaigns", selectedCampaign.id, "courts");
        const courtsSnap = await getDocs(courtsRef);
        for (const courtDoc of courtsSnap.docs) {
          if (courtDoc.id === user.uid) {
            inPedigree = true;
            break;
          }
          const courtData = courtDoc.data();
          const members = courtData.members || [];
          if (members.some((m: any) => m.userId === user.uid)) {
            inPedigree = true;
            break;
          }
        }
      }

      if (!inPedigree) {
        setError("Only users who are part of or added to the chain of command (pedigree) can post onto this campaign.");
        setIsSubmitting(false);
        return;
      }

      const newPost = {
        userId: user.uid,
        userDisplayName: user.displayName || "Sovereign Lord",
        userPhotoURL: user.photoURL || null,
        caption: caption.trim(),
        imageUrl: imageUrl.trim(),
        likesCount: 0,
        campaignId: selectedCampaign.id,
        campaignTitle: selectedCampaign.domainTitle,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "posts"), newPost);
      onSuccess();
    } catch (err) {
      console.error("Error creating post:", err);
      setError("Failed to create post.");
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
          {error && (
            <div className="p-3 rounded-lg bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {campaigns.length === 0 ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm rounded-xl">
              You must be a part of a kingdom (campaign) to issue a decree. Please create or join one first.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Campaign</label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all dark:text-white"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.domainTitle.toUpperCase()} {c.creatorId === user.uid ? "(OWNED REALM)" : ""}
                    </option>
                  ))}
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
                          setError("Failed to process image.");
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
                  disabled={isSubmitting || campaigns.length === 0}
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
