import React, { useState } from "react";
import { Heart, MessageCircle, Share2, Trash2, MoreHorizontal, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../firebase";

export interface Post {
  id: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  imageUrl: string;
  caption: string;
  likesCount: number;
  likes?: string[];
  comments?: { id: string; userId: string; userDisplayName: string; text: string; createdAt: number }[];
  createdAt: any;
  campaignId?: string;
  campaignTitle?: string;
}

interface PostCardProps {
  post: Post;
  currentUser: any;
  onViewProfile?: (user: { uid: string; displayName: string | null; photoURL?: string | null }) => void;
  onViewCampaign?: (campaignId: string) => void;
  onDelete?: (postId: string) => void;
  isClickable?: boolean;
  onClick?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, currentUser, onViewProfile, onViewCampaign, onDelete, isClickable, onClick }) => {
  const [isLiking, setIsLiking] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const isLiked = post.likes?.includes(currentUser?.uid);

  const logPostInteraction = async () => {
    if (!currentUser || currentUser.uid === post.userId) return;
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        fetch("/api/log-post-interaction", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ targetUserId: post.userId })
        }).catch(err => console.error("Failed to log post interaction", err));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || isLiking) return;
    
    setIsLiking(true);
    try {
      const postRef = doc(db, "posts", post.id);
      if (isLiked) {
        await updateDoc(postRef, {
          likes: arrayRemove(currentUser.uid),
          likesCount: Math.max(0, (post.likesCount || 0) - 1)
        });
      } else {
        await updateDoc(postRef, {
          likes: arrayUnion(currentUser.uid),
          likesCount: (post.likesCount || 0) + 1
        });
        logPostInteraction();
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    } finally {
      setIsLiking(false);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`);
      alert("Post link copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy link: ", err);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      const comment = {
        id: Date.now().toString(),
        userId: currentUser.uid,
        userDisplayName: currentUser.displayName || "Unknown user",
        text: newComment.trim(),
        createdAt: Date.now()
      };
      const postRef = doc(db, "posts", post.id);
      await updateDoc(postRef, {
        comments: arrayUnion(comment)
      });
      setNewComment("");
      logPostInteraction();
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this post? This action cannot be undone.")) return;
    try {
      const postRef = doc(db, "posts", post.id);
      await deleteDoc(postRef);
      if (onDelete) onDelete(post.id);
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post. Please try again.");
    }
  };

  return (
    <motion.div
      layout={isClickable ? true : false}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={isClickable ? onClick : undefined}
      className={`bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 sm:rounded-xl overflow-hidden ${isClickable ? "cursor-pointer" : ""}`}
    >
      {/* Post Header */}
      <div className="flex items-center justify-between p-3 relative">
        <div className="flex items-center gap-3">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (onViewProfile) onViewProfile({ uid: post.userId, displayName: post.userDisplayName, photoURL: post.userPhotoURL });
            }}
            className="flex shrink-0 items-center cursor-pointer group"
          >
            <img 
              src={post.userPhotoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"} 
              alt={post.userDisplayName}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-transparent group-hover:ring-amber-500 transition-all"
              onError={(e) => { e.currentTarget.src = "https://ui-avatars.com/api/?name=User&background=random"; }}
            />
          </button>
          <div className="flex flex-col items-start text-left">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (onViewProfile) onViewProfile({ uid: post.userId, displayName: post.userDisplayName, photoURL: post.userPhotoURL });
              }}
              className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-amber-500 transition-colors leading-tight cursor-pointer"
            >
              {post.userDisplayName}
            </button>
            {post.campaignTitle && (
              onViewCampaign ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (post.campaignId) onViewCampaign(post.campaignId);
                  }}
                  className="text-[10px] text-amber-600/90 dark:text-amber-400/90 hover:text-amber-700 hover:underline font-mono font-normal uppercase tracking-wider leading-none mt-0.5 cursor-pointer text-left"
                >
                  {post.campaignTitle}
                </button>
              ) : (
                <span className="text-[10px] text-amber-600/90 dark:text-amber-400/90 font-mono font-normal uppercase tracking-wider leading-none mt-0.5 text-left">
                  {post.campaignTitle}
                </span>
              )
            )}
          </div>
        </div>
        
        {currentUser?.uid === post.userId && (
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowOptions(!showOptions);
              }} 
              className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-100 dark:border-slate-700 z-10 overflow-hidden"
                >
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOptions(false);
                      handleDelete();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Post
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Media or Text Content */}
      {post.imageUrl ? (
        <>
          <div className="w-full bg-slate-100 dark:bg-slate-900 overflow-hidden relative">
            <img 
              src={post.imageUrl || undefined} 
              alt="Post content"
              className="w-full h-auto object-cover max-h-[70vh]"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <div className="p-3">
            <div className="flex items-center gap-4 mb-3">
              <button 
                onClick={handleLike} 
                className={`transition-colors ${isLiked ? 'text-rose-500' : 'text-slate-900 dark:text-white hover:text-rose-500 dark:hover:text-rose-500'}`}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowComments(!showComments); }} 
                className="text-slate-900 dark:text-white hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <MessageCircle className="w-6 h-6" />
              </button>
              <button onClick={handleShare} className="text-slate-900 dark:text-white hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <Share2 className="w-6 h-6" />
              </button>
            </div>
            
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
              {(post.likesCount || 0).toLocaleString()} likes
            </div>
            
            {post.caption && (
              <div className="text-sm text-slate-900 dark:text-slate-100">
                <span className="font-bold mr-2">{post.userDisplayName}</span>
                {post.caption}
              </div>
            )}
            
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mt-2 font-mono">
              {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : "Just now"}
            </div>
          </div>
        </>
      ) : (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50">
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{post.caption}</p>
          
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button 
              onClick={handleLike}
              className={`transition-colors flex items-center gap-1.5 ${isLiked ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500'}`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-xs font-bold">{post.likesCount || 0}</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowComments(!showComments); }} 
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center gap-1.5"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-xs font-bold">{post.comments?.length || 0}</span>
            </button>
            <button onClick={handleShare} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800"
          >
            <div className="p-3 max-h-48 overflow-y-auto space-y-3">
              {(!post.comments || post.comments.length === 0) ? (
                <p className="text-xs text-slate-500 text-center py-2">No comments yet. Be the first!</p>
              ) : (
                post.comments.map(comment => (
                  <div key={comment.id} className="text-sm">
                    <span className="font-bold text-slate-900 dark:text-slate-100 mr-2">{comment.userDisplayName}</span>
                    <span className="text-slate-700 dark:text-slate-300 break-words">{comment.text}</span>
                  </div>
                ))
              )}
            </div>
            {currentUser && (
              <form onSubmit={submitComment} className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400 dark:text-slate-100"
                />
                <button 
                  type="submit" 
                  disabled={!newComment.trim() || isSubmittingComment}
                  className="text-amber-500 font-bold text-sm px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post"}
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PostCard;
