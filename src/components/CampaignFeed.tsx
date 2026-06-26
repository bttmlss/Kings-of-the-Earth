import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "../firebase";
import { motion } from "motion/react";
import { Heart, MessageCircle } from "lucide-react";

interface Post {
  id: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  imageUrl: string;
  caption: string;
  likesCount: number;
  createdAt: any;
}

interface CampaignFeedProps {
  campaignId: string;
}

export default function CampaignFeed({ campaignId }: CampaignFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const postsRef = collection(db, "posts");
    const q = query(
      postsRef,
      where("campaignId", "==", campaignId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let loadedPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      
      // Sort locally to avoid composite index requirement
      loadedPosts.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      
      setPosts(loadedPosts);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching campaign feed posts:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [campaignId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
        <p>No decrees have been issued in this domain yet.</p>
      </div>
    );
  }

  return (
    <div className="columns-2 sm:columns-3 gap-4 space-y-4 pb-12 pr-2">
      {posts.map((post) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="break-inside-avoid w-full rounded-2xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative group cursor-pointer"
        >
          {post.imageUrl ? (
            <>
              <img 
                src={post.imageUrl || undefined} 
                alt={post.caption}
                className="w-full h-auto object-cover"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                <p className="text-white text-xs font-medium line-clamp-2 mb-2">
                  {post.caption}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <img 
                      src={post.userPhotoURL || "https://ui-avatars.com/api/?name=User"} 
                      alt={post.userDisplayName}
                      className="w-5 h-5 rounded-full ring-1 ring-white/50"
                      onError={(e) => { e.currentTarget.src = "https://ui-avatars.com/api/?name=User&background=random"; }}
                    />
                    <span className="text-white text-[10px] font-bold truncate">
                      {post.userDisplayName}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-white/90 text-[10px] font-bold">
                    <div className="flex items-center gap-1">
                      <Heart className="w-3 h-3 fill-white/20" />
                      <span>{post.likesCount || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 flex flex-col justify-between h-full bg-slate-50 dark:bg-slate-900">
              <p className="text-slate-800 dark:text-slate-200 text-sm font-medium whitespace-pre-wrap mb-4">
                {post.caption}
              </p>
              <div className="flex items-center gap-3 mt-auto">
                <div className="flex items-center gap-1.5 shrink-0">
                  <img 
                    src={post.userPhotoURL || "https://ui-avatars.com/api/?name=User"} 
                    alt={post.userDisplayName}
                    className="w-5 h-5 rounded-full ring-1 ring-slate-300 dark:ring-slate-600"
                    onError={(e) => { e.currentTarget.src = "https://ui-avatars.com/api/?name=User&background=random"; }}
                  />
                  <span className="text-slate-600 dark:text-slate-400 text-[10px] font-bold truncate">
                    {post.userDisplayName}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2 text-slate-400 text-[10px] font-bold">
                  <div className="flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    <span>{post.likesCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
