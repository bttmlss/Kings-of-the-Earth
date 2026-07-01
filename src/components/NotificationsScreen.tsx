import React, { useState, useEffect, useMemo } from "react";
import { User } from "firebase/auth";
import { collection, query, where, limit, onSnapshot, updateDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { Bell, UserPlus, Trophy, CheckCircle, Heart, MessageCircle, Layers, Vote } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface NotificationsScreenProps {
  currentUser: User;
}

interface AppNotification {
  id: string;
  userId: string;
  type: "follow" | "percentile" | "campaign_join" | "like" | "comment" | "vote";
  title: string;
  body: string;
  read: boolean;
  createdAt: any;
  sourceUserId?: string;
  sourceUserPhoto?: string;
  sourceUserName?: string;
  leaderboardId?: string;
  campaignId?: string;
  needsApproval?: boolean;
}

export function NotificationsScreen({ currentUser }: NotificationsScreenProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "social" | "campaign">("all");

  useEffect(() => {
    const notifsRef = collection(db, "notifications");
    const q = query(
      notifsRef,
      where("userId", "==", currentUser.uid),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const loaded = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AppNotification[];
      loaded.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setNotifications(loaded);
      setIsLoading(false);
    }, (error) => {
      console.error("Error loading notifications:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  const handleAcceptRequest = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/accept-campaign-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          campaignId: n.campaignId,
          candidateId: n.sourceUserId,
          notificationId: n.id
        })
      });
      if (!res.ok) {
        throw new Error("Failed to accept request");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to accept request.");
    }
  };

  const markAsRead = async (id: string | string[]) => {
    try {
      if (Array.isArray(id)) {
        const batch = writeBatch(db);
        id.forEach((i) => {
          batch.update(doc(db, "notifications", i), { read: true });
        });
        await batch.commit();
      } else {
        await updateDoc(doc(db, "notifications", id), { read: true });
      }
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  const processedNotifications = useMemo(() => {
    // 1. Filter by tab
    const filtered = notifications.filter(n => {
      if (activeTab === "all") return true;
      if (activeTab === "social") return n.type === "like" || n.type === "comment" || n.type === "follow";
      if (activeTab === "campaign") return n.type === "campaign_join" || n.type === "vote" || n.type === "percentile";
      return true;
    });

    // 2. Group likes/comments within a 1-hour window
    const HOUR_MS = 60 * 60 * 1000;
    const grouped: any[] = [];
    const skipIds = new Set<string>();

    for (let i = 0; i < filtered.length; i++) {
      const n = filtered[i];
      if (skipIds.has(n.id)) continue;

      if (n.type === "like" || n.type === "comment") {
        const group = [n];
        const nTime = n.createdAt?.toDate ? n.createdAt.toDate().getTime() : 0;
        
        for (let j = i + 1; j < filtered.length; j++) {
          const next = filtered[j];
          if (skipIds.has(next.id)) continue;
          
          if (next.type === n.type) {
            const nextTime = next.createdAt?.toDate ? next.createdAt.toDate().getTime() : 0;
            if (Math.abs(nTime - nextTime) <= HOUR_MS) {
              group.push(next);
              skipIds.add(next.id);
            }
          }
        }
        
        if (group.length > 1) {
          const readCount = group.filter(x => x.read).length;
          grouped.push({
            isGroup: true,
            type: n.type,
            items: group,
            count: group.length,
            title: `${group.length} New ${n.type === "like" ? "Likes" : "Comments"}`,
            body: `You received ${group.length} new ${n.type === "like" ? "likes" : "comments"} recently.`,
            createdAt: group[0].createdAt,
            read: readCount === group.length,
            ids: group.map(x => x.id)
          });
        } else {
          grouped.push(n);
        }
      } else {
        grouped.push(n);
      }
    }
    
    return grouped;
  }, [notifications, activeTab]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-32 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-600 dark:text-amber-500" />
        </div>
        <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Notifications</h2>
      </div>

      <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl mb-6 shadow-xs border border-slate-200 dark:border-slate-800">
        {(["all", "social", "campaign"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs font-bold uppercase tracking-widest py-2.5 rounded-lg transition-all ${
              activeTab === tab 
                ? "bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-500 shadow-sm border border-slate-200 dark:border-slate-700" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {processedNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <CheckCircle className="w-12 h-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">You're all caught up!</h3>
          <p className="text-sm text-slate-500 max-w-[250px]">
            No recent {activeTab !== "all" ? activeTab : ""} notifications found.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {processedNotifications.map((n) => {
              const key = n.isGroup ? `group-${n.ids.join('-')}` : n.id;
              
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => { if (!n.read) markAsRead(n.isGroup ? n.ids : n.id); }}
                  className={`p-4 rounded-xl border ${
                    n.read 
                      ? "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800" 
                      : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 cursor-pointer"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {n.isGroup ? (
                       <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                         <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                       </div>
                    ) : n.type === "follow" || n.type === "campaign_join" ? (
                      n.sourceUserPhoto ? (
                        <img src={n.sourceUserPhoto || undefined} alt="User" className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-slate-100 dark:ring-slate-800" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      )
                    ) : n.type === "like" ? (
                      <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                        <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      </div>
                    ) : n.type === "comment" ? (
                      <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    ) : n.type === "vote" ? (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                        <Vote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                        <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <p className={`font-bold text-sm ${n.read ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-white"}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        {n.body}
                      </p>
                      
                      {n.needsApproval && !n.isGroup && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={(e) => handleAcceptRequest(e, n)}
                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            Accept Request
                          </button>
                        </div>
                      )}

                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono uppercase tracking-wider">
                        {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
