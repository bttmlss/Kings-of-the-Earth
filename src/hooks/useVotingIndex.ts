import { useState, useEffect } from "react";
import { collection, collectionGroup, query, where, orderBy, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export interface DataPoint {
  date: string;
  cumulative: number;
  count: number;
}

// Global cache for frozen campaign IDs to avoid redundant fetching on every mount
let cachedFrozenCampaigns: Set<string> | null = null;
let isFetchingFrozenCampaigns = false;
const frozenCampaignsPromise: ((val: Set<string>) => void)[] = [];

async function getFrozenCampaignIds() {
  if (cachedFrozenCampaigns) return cachedFrozenCampaigns;
  
  if (isFetchingFrozenCampaigns) {
    return new Promise<Set<string>>((resolve) => {
      frozenCampaignsPromise.push(resolve as any);
    });
  }

  isFetchingFrozenCampaigns = true;
  const frozen = new Set<string>();
  try {
    const qCamps = query(collection(db, "campaigns"));
    const snapshot = await getDocs(qCamps);
    snapshot.forEach((doc) => {
      const d = doc.data();
      if (d.isFrozen) {
        frozen.add(doc.id);
      }
    });
    cachedFrozenCampaigns = frozen;
  } catch (err) {
    console.warn("Failed fetching campaigns in useVotingIndex setup:", err);
  } finally {
    isFetchingFrozenCampaigns = false;
    frozenCampaignsPromise.forEach(resolve => resolve(cachedFrozenCampaigns || new Set()));
    frozenCampaignsPromise.length = 0;
  }
  return cachedFrozenCampaigns || new Set();
}

export function useVotingIndex(uid: string, days = 30, campaignId?: string) {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [deltaAbs, setDeltaAbs] = useState(0);
  const [deltaPct, setDeltaPct] = useState(0);
  const [isUp, setIsUp] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    let active = true;
    let unsubscribe: (() => void) | null = null;

    const runSetup = async () => {
      // 1. Fetch campaigns to build a set of frozen campaign IDs
      let frozenCampaignIds = new Set<string>();
      if (!campaignId) {
        frozenCampaignIds = await getFrozenCampaignIds();
      }

      if (!active) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let q;
      try {
        if (campaignId) {
          q = query(
            collection(db, "campaigns", campaignId, "votes"),
            where("candidateId", "==", uid),
            where("votedAt", ">=", cutoffDate),
            orderBy("votedAt", "asc")
          );
        } else {
          q = query(
            collectionGroup(db, "votes"),
            where("candidateId", "==", uid),
            where("votedAt", ">=", cutoffDate),
            orderBy("votedAt", "asc")
          );
        }
      } catch (err: any) {
        console.error("Query construction error:", err);
        setError(err);
        setIsLoading(false);
        return;
      }

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          try {
            const votesList: { votedAt: Date }[] = [];
            snapshot.forEach((doc) => {
              // Parse campaignId from doc path: e.g. campaigns/CAMPAIGN_ID/votes/VOTE_ID
              const pathParts = doc.ref.path.split('/');
              const campaignIdForVote = pathParts[1];
              if (frozenCampaignIds.has(campaignIdForVote)) {
                return;
              }

              const data = doc.data();
              let votedAtDate: Date;
              if (data.votedAt) {
                if (typeof data.votedAt.toDate === "function") {
                  votedAtDate = data.votedAt.toDate();
                } else if (data.votedAt.seconds !== undefined) {
                  votedAtDate = new Date(data.votedAt.seconds * 1000);
                } else {
                  votedAtDate = new Date(data.votedAt);
                }
              } else {
                votedAtDate = new Date();
              }
              votesList.push({ votedAt: votedAtDate });
            });

            // Generate date strings for the last N days (inclusive of today)
            const dates: string[] = [];
            const today = new Date();
            for (let i = days - 1; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(today.getDate() - i);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, "0");
              const date = String(d.getDate()).padStart(2, "0");
              dates.push(`${year}-${month}-${date}`);
            }

            let preWindowCount = 0;
            const dateToVoteCount: { [date: string]: number } = {};

            votesList.forEach((vote) => {
              const y = vote.votedAt.getFullYear();
              const m = String(vote.votedAt.getMonth() + 1).padStart(2, "0");
              const dStr = String(vote.votedAt.getDate()).padStart(2, "0");
              const formatted = `${y}-${m}-${dStr}`;

              if (formatted < dates[0]) {
                preWindowCount++;
              } else {
                dateToVoteCount[formatted] = (dateToVoteCount[formatted] || 0) + 1;
              }
            });

            let runningTotal = preWindowCount;
            const newPoints = dates.map((dateStr) => {
              const votesToday = dateToVoteCount[dateStr] || 0;
              runningTotal += votesToday;
              return {
                date: dateStr,
                cumulative: runningTotal,
                count: votesToday,
              };
            });

            const total = runningTotal;
            const dAbs = total - preWindowCount;
            const dPct = preWindowCount > 0 ? (dAbs / preWindowCount) * 100 : (dAbs > 0 ? 100 : 0);

            setPoints(newPoints);
            setTotalVotes(total);
            setDeltaAbs(dAbs);
            setDeltaPct(dPct);
            setIsUp(dAbs > 0);
            setIsLoading(false);
          } catch (err: any) {
            console.error("Error mapping votes snapshot:", err);
            setError(err);
            setIsLoading(false);
          }
        },
        (err) => {
          console.warn("Voting Index Query Group Listener Error:", err);
          setError(err);
          setIsLoading(false);
        }
      );
    };

    runSetup();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [uid, days, campaignId]);

  return { points, totalVotes, deltaAbs, deltaPct, isUp, isLoading, error };
}
