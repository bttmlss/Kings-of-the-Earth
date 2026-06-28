import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { collection, query, limit, onSnapshot, getDocs, where, doc, setDoc, increment } from "firebase/firestore";
import { db } from "../firebase";
import { UserPlus, Clock, Scroll, Award } from "lucide-react";
import PostCard, { Post } from "./PostCard";
import InfiniteScroll from "react-infinite-scroll-component";
import { useInView } from "react-intersection-observer";

interface HomeFeedProps {
  currentUser: User;
  onViewProfile: (user: { uid: string; displayName: string | null; photoURL?: string | null }) => void;
  onViewCampaign?: (campaignId: string) => void;
}

interface TrackedPostCardProps {
  key?: any;
  post: any;
  currentUser: any;
  onViewProfile?: any;
  onViewCampaign?: (campaignId: string) => void;
  onPostViewed: (postId: string, duration: number) => void;
}

// Sub-component that uses useInView to track engagement on each individual post
function TrackedPostCard({ post, currentUser, onViewProfile, onViewCampaign, onPostViewed }: TrackedPostCardProps) {
  const { ref, inView } = useInView({
    threshold: 0.5, // 50% visibility threshold
    triggerOnce: false,
  });

  const entryTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (inView) {
      entryTimeRef.current = Date.now();
    } else {
      if (entryTimeRef.current) {
        const duration = Math.round((Date.now() - entryTimeRef.current) / 1000);
        if (duration > 0) {
          onPostViewed(post.id, duration);
        }
        entryTimeRef.current = null;
      }
    }

    return () => {
      if (entryTimeRef.current) {
        const duration = Math.round((Date.now() - entryTimeRef.current) / 1000);
        if (duration > 0) {
          onPostViewed(post.id, duration);
        }
      }
    };
  }, [inView, post.id, onPostViewed]);

  return (
    <div ref={ref} className="w-full">
      <PostCard 
        post={post} 
        currentUser={currentUser} 
        onViewProfile={onViewProfile}
        onViewCampaign={onViewCampaign}
      />
    </div>
  );
}

export default function HomeFeed({ currentUser, onViewProfile, onViewCampaign }: HomeFeedProps) {
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [displayedPosts, setDisplayedPosts] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Engagement States (shown live in the visual header for immediate testing feedback)
  const [sessionTime, setSessionTime] = useState(0);
  const [maxScrollDepth, setMaxScrollDepth] = useState(0);
  const [viewedPostIds, setViewedPostIds] = useState<Set<string>>(new Set());

  // Accumulators for high-efficiency periodic Firestore syncing
  const unsyncedTimeRef = useRef<number>(0);
  const unsyncedViewsRef = useRef<number>(0);
  const maxScrollDepthRef = useRef<number>(0);
  const lastSyncedScrollDepthRef = useRef<number>(0);
  const lastSyncTimeRef = useRef<number>(Date.now());

  // Track session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime(prev => {
        const next = prev + 1;
        unsyncedTimeRef.current += 1;
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Track window scroll depth percentage
  useEffect(() => {
    const handleScroll = () => {
      const docEl = document.documentElement;
      const body = document.body;
      const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop;
      const scrollHeight = docEl.scrollHeight || body.scrollHeight;
      const clientHeight = docEl.clientHeight || window.innerHeight;
      
      const totalScrollable = scrollHeight - clientHeight;
      if (totalScrollable > 0) {
        const depth = Math.round((scrollTop / totalScrollable) * 100);
        setMaxScrollDepth(prev => {
          const next = Math.max(prev, depth);
          maxScrollDepthRef.current = next;
          return next;
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Run initial check
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handler for when a post is viewed
  const handlePostViewed = (postId: string, duration: number) => {
    setViewedPostIds(prev => {
      if (!prev.has(postId)) {
        const next = new Set(prev);
        next.add(postId);
        unsyncedViewsRef.current += 1;
        return next;
      }
      return prev;
    });
  };

  // Sync accumulated metrics to Firestore daily_engagement
  const syncEngagementToFirebase = async (
    timeSpentDelta: number,
    scrollDepth: number,
    viewedCountDelta: number
  ) => {
    try {
      if (!currentUser?.uid) return;
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const dailyStatsRef = doc(db, `user_profiles/${currentUser.uid}/daily_engagement`, today);
      
      await setDoc(dailyStatsRef, {
        date: today,
        visits: increment(0), // keep visit logs intact
        feedTimeSpent: increment(timeSpentDelta),
        postsViewed: increment(viewedCountDelta),
        feedScrollDepth: scrollDepth
      }, { merge: true });
    } catch (err) {
      console.warn("Failed to sync engagement metrics directly:", err);
    }
  };

  // Periodic and unmount syncing mechanism
  useEffect(() => {
    lastSyncTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const timeDelta = unsyncedTimeRef.current;
      const viewsDelta = unsyncedViewsRef.current;
      const currentScroll = maxScrollDepthRef.current;

      if (timeDelta > 0 || viewsDelta > 0 || currentScroll > lastSyncedScrollDepthRef.current) {
        unsyncedTimeRef.current = 0;
        unsyncedViewsRef.current = 0;
        lastSyncedScrollDepthRef.current = currentScroll;
        syncEngagementToFirebase(timeDelta, currentScroll, viewsDelta);
      }
    }, 8000); // sync every 8 seconds

    return () => {
      clearInterval(interval);
      // Flush any leftover accumulated metrics on component unmount
      const timeDelta = unsyncedTimeRef.current;
      const viewsDelta = unsyncedViewsRef.current;
      const currentScroll = maxScrollDepthRef.current;
      if (timeDelta > 0 || viewsDelta > 0 || currentScroll > lastSyncedScrollDepthRef.current) {
        syncEngagementToFirebase(timeDelta, currentScroll, viewsDelta);
      }
    };
  }, [currentUser.uid]);

  // Load feed posts from Firestore
  useEffect(() => {
    let unsubscribePosts: (() => void) | undefined;
    
    const loadFeed = async () => {
      try {
        // 1. Get followees
        const followsRef = collection(db, "follows");
        const followsQ = query(
          followsRef, 
          where("followerId", "==", currentUser.uid),
          where("status", "==", "accepted")
        );
        
        const followsSnap = await getDocs(followsQ);
        const followingIds = followsSnap.docs.map(doc => doc.data().followingId);
        
        // 2. Add current user
        followingIds.push(currentUser.uid);
        
        // 3. Keep targetIds safe (max 30 due to Firestore "in" query restriction)
        const targetIds = followingIds.slice(0, 30);

        const postsRef = collection(db, "posts");
        const q = query(
          postsRef,
          where("userId", "in", targetIds),
          limit(150) // Load larger pool for client-side sorting and infinite scroll paging
        );
        
        unsubscribePosts = onSnapshot(q, (snapshot) => {
          if (snapshot.empty) {
            setAllPosts([]);
            setDisplayedPosts([]);
            setHasMore(false);
            setIsLoading(false);
          } else {
            const loadedPosts = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Post[];
            
            // Sort on client to avoid composite index requirement issues
            loadedPosts.sort((a, b) => {
              const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
              const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
              return bTime - aTime;
            });
            
            setAllPosts(loadedPosts);
            // Load first page of 10 posts
            setDisplayedPosts(loadedPosts.slice(0, 10));
            setHasMore(loadedPosts.length > 10);
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

  const loadMoreData = () => {
    if (displayedPosts.length >= allPosts.length) {
      setHasMore(false);
      return;
    }
    
    // Paginate by displaying 10 more posts
    const nextLimit = displayedPosts.length + 10;
    const nextPosts = allPosts.slice(0, nextLimit);
    setDisplayedPosts(nextPosts);
    setHasMore(nextLimit < allPosts.length);
  };

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



      {allPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 mx-4">
          <UserPlus className="w-12 h-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Your feed is empty</h3>
          <p className="text-sm text-slate-500 max-w-[250px]">
            Follow other claimants to see their recent campaign posts and dominion updates here.
          </p>
        </div>
      ) : (
        <InfiniteScroll
          dataLength={displayedPosts.length}
          next={loadMoreData}
          hasMore={hasMore}
          loader={
            <div className="flex justify-center items-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
            </div>
          }
          endMessage={
            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              🛡️ End of the realm's decrees 🛡️
            </div>
          }
          className="space-y-6 pb-20"
        >
          {displayedPosts.map((post) => (
            <TrackedPostCard 
              key={post.id} 
              post={post} 
              currentUser={currentUser} 
              onViewProfile={onViewProfile} 
              onViewCampaign={onViewCampaign}
              onPostViewed={handlePostViewed}
            />
          ))}
        </InfiniteScroll>
      )}
    </div>
  );
}
