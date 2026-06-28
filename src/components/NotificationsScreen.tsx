import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { Bell, UserPlus, Trophy, CheckCircle } from "lucide-react";
import { motion } from "motion/react";

interface NotificationsScreenProps {
  currentUser: User;
}

interface AppNotification {
  id: string;
  userId: string;
  type: "follow" | "percentile" | "campaign_join";
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

  useEffect(() => {
    const notifsRef = collection(db, "notifications");
    const q = query(
      notifsRef,
      where("userId", "==", currentUser.uid),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const loaded = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AppNotification[];
      // Sort on client
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

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-32">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-600 dark:text-amber-500" />
        </div>
        <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Notifications</h2>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <CheckCircle className="w-12 h-12 text-slate-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">You're all caught up!</h3>
          <p className="text-sm text-slate-500 max-w-[250px]">
            When someone follows you or you move up the ranks, we'll notify you here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => { if (!n.read) markAsRead(n.id); }}
              className={`p-4 rounded-xl border ${
                n.read 
                  ? "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800" 
                  : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 cursor-pointer"
              }`}
            >
              <div className="flex items-start gap-4">
                {n.type === "follow" || n.type === "campaign_join" ? (
                  n.sourceUserPhoto ? (
                    <img src={n.sourceUserPhoto || undefined} alt="User" className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-slate-100 dark:ring-slate-800" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  )
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
                  
                  {n.needsApproval && (
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
          ))}
        </div>
      )}
    </div>
  );
}
