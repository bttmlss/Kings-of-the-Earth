import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { VotingCandle } from "../types";

export function useUserCandles(userId: string | undefined, interval: string = "1d") {
  const [candles, setCandles] = useState<VotingCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  const fetchCandles = useCallback(async (isLoadMore = false) => {
    if (!userId) return;
    if (isLoadMore && (!hasMoreRef.current || isLoading)) return;

    setIsLoading(true);
    try {
      const limit = 100;
      const res = await fetch(`/api/user-candles/${userId}?interval=${interval}&limit=${isLoadMore ? offsetRef.current + limit : limit}`);
      const data = await res.json();
      
      if (data.success && data.candles) {
        if (data.candles.length < limit && !isLoadMore) {
           hasMoreRef.current = false;
        } else if (data.candles.length === offsetRef.current) {
           hasMoreRef.current = false;
        }
        
        offsetRef.current = data.candles.length;
        setCandles(data.candles);
      } else {
        throw new Error(data.error || "Failed");
      }
    } catch (err: any) {
      console.error(err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, interval]);

  useEffect(() => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setCandles([]);
    fetchCandles();
    
    if (!userId) return;

    const now = new Date();
    const dateStr = now.toISOString().substring(0, 13);
    let activeCandleRef;
    let unsubscribe = () => {};
    
    if (interval === "1d" || interval === "1h") {
       activeCandleRef = doc(db, `user_profiles/${userId}/hourly_candles/${dateStr}`);
       unsubscribe = onSnapshot(activeCandleRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const updatedCandle: VotingCandle = {
            id: docSnap.id || data.id,
            campaignId: userId,
            startTimestamp: data.startTimestamp?.toDate?.() || data.startTimestamp,
            endTimestamp: data.endTimestamp?.toDate?.() || data.endTimestamp,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume,
          };
          
          setCandles(prev => {
            const index = prev.findIndex(c => c.id === updatedCandle.id);
            if (index >= 0) {
              const newCandles = [...prev];
              newCandles[index] = updatedCandle;
              return newCandles;
            } else {
              return [...prev, updatedCandle];
            }
          });
        }
      }, (err) => {
        console.warn("Snapshot subscription failed for user daily active candle:", err);
      });
    }

    return () => {
      unsubscribe();
    };
  }, [userId, interval, fetchCandles]);

  const loadMore = useCallback(() => {
    fetchCandles(true);
  }, [fetchCandles]);

  return { candles, isLoading, error, loadMore, hasMore: hasMoreRef.current };
}
