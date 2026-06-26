import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { VotingCandle } from "../types";

export function useCampaignCandles(campaignId: string | undefined, interval: string = "1d") {
  const [candles, setCandles] = useState<VotingCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);

  const fetchCandles = useCallback(async (isLoadMore = false) => {
    if (!campaignId) return;
    if (isLoadMore && (!hasMoreRef.current || isLoading)) return;

    setIsLoading(true);
    try {
      const limit = 100;
      // In a real paginated Firestore backend, we'd pass an offset or a cursor.
      // Since interval aggregation currently relies on fetching all the way up to limit,
      // true cursor pagination would modify the backend endpoint to handle startAt.
      // For now, we simulate pagination limit growth or pass `limit=${offsetRef.current + limit}`
      
      const res = await fetch(`/api/campaign-candles/${campaignId}?interval=${interval}&limit=${isLoadMore ? offsetRef.current + limit : limit}`);
      const data = await res.json();
      
      if (data.success && data.candles) {
        if (data.candles.length < limit && !isLoadMore) {
           hasMoreRef.current = false;
        } else if (data.candles.length === offsetRef.current) {
           hasMoreRef.current = false; // no new data
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
  }, [campaignId, interval]);

  useEffect(() => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setCandles([]);
    fetchCandles();
    
    if (!campaignId) return;

    // Real-time listener for today's active candle
    const now = new Date();
    const dateStr = now.toISOString().substring(0, 13);
    let activeCandleRef;
    let unsubscribe = () => {};
    
    // We only attach realtime listener if interval is 1h (was 1d), 
    // or if the aggregated time frame includes today.
    // For simplicity, always listen to hourly and manually merge if needed, 
    // but the hook uses it to directly update the matching ID.
    // If the interval is "1h", the ID matches dateStr.
    if (interval === "1h" || interval === "1d") {
       activeCandleRef = doc(db, `campaigns/${campaignId}/hourly_candles/${dateStr}`);
       unsubscribe = onSnapshot(activeCandleRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const updatedCandle: VotingCandle = {
            id: docSnap.id || data.id,
            campaignId: campaignId,
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
        console.warn("Snapshot subscription failed for campaign daily active candle:", err);
      });
    }

    return () => {
      unsubscribe();
    };
  }, [campaignId, interval, fetchCandles]);

  const loadMore = useCallback(() => {
    fetchCandles(true);
  }, [fetchCandles]);

  return { candles, isLoading, error, loadMore, hasMore: hasMoreRef.current };
}
