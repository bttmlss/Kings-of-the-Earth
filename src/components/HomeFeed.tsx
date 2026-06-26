import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { motion } from "motion/react";
import { collection, query, orderBy, limit, onSnapshot, getDocs, where } from "firebase/firestore";
import { db } from "../firebase";
import { Heart, MessageCircle, Share2, MoreHorizontal, UserPlus } from "lucide-react";
import PostCard, { Post } from "./PostCard";

interface HomeFeedProps {
  currentUser: User;
  onViewProfile: (user: { uid: string; displayName: string | null; photoURL?: string | null }) => void;
}

export default function HomeFeed({ currentUser, onViewProfile }: HomeFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribePosts: (() => void) | undefined;
    
    const loadFeed = async () => {
      try {
        // 1. Get the users the current user follows
        const followsRef = collection(db, "follows");
        const followsQ = query(
          followsRef, 
          where("followerId", "==", currentUser.uid),
          where("status", "==", "accepted")
        );
        
        const followsSnap = await getDocs(followsQ);
        const followingIds = followsSnap.docs.map(doc => doc.data().followingId);
        
        // 2. Add current user to see their own posts
        followingIds.push(currentUser.uid);
        
        // 3. Firestore 'in' query supports up to 30 elements. 
        // We take the first 30 for this implementation.
        const targetIds = followingIds.slice(0, 30);

        const postsRef = collection(db, "posts");
        const q = query(
          postsRef,
          where("userId", "in", targetIds),
          limit(50)
        );
        
        unsubscribePosts = onSnapshot(q, (snapshot) => {
          if (snapshot.empty) {
            setPosts([]);
            setIsLoading(false);
          } else {
            const loadedPosts = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Post[];
            // Sort on the client instead of using orderBy to avoid missing composite index errors
            loadedPosts.sort((a, b) => {
              const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
              const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
              return bTime - aTime;
            });
            setPosts(loadedPosts);
            setIsLoading(false);
          }
        }, (error) => {
          console.error("Error fetching posts:", error);
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Error loading feed:", err);
        setIsLoading(false);
      }
    };

    loadFeed();

    return () => {
      if (unsubscribePosts) {
        unsubscribePosts();
      }
    };
  }, [currentUser.uid]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Feed</h2>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 mx-4">
          <UserPlus className="w-12 h-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Your feed is empty</h3>
          <p className="text-sm text-slate-500 max-w-[250px]">
            Follow other claimants to see their recent campaign posts and dominion updates here.
          </p>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard 
            key={post.id} 
            post={post} 
            currentUser={currentUser} 
            onViewProfile={onViewProfile} 
          />
        ))
      )}
    </div>
  );
}
