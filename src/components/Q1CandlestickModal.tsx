import React, { useState } from "react";
import { X, Activity, TrendingUp, TrendingDown, Clock, BarChart2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useCampaignCandles } from "../hooks/useCampaignCandles";
import VotingCandlestickChart from "./VotingCandlestickChart";

interface Q1CandlestickModalProps {
  onClose: () => void;
  campaignId?: string;
}

const Q1CandlestickModal: React.FC<Q1CandlestickModalProps> = ({ onClose, campaignId }) => {
  const [interval, setInterval] = useState("1h");
  const { candles, isLoading, hasMore, loadMore, error } = useCampaignCandles(campaignId, interval);

  const latestCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  
  let changePercent = 0;
  if (latestCandle && previousCandle && previousCandle.close > 0) {
    changePercent = ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          className="absolute inset-0 bg-slate-900/60 dark:bg-black/80"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="relative w-full max-w-5xl bg-white dark:bg-[#07080b] border border-slate-300 dark:border-slate-800 rounded-3xl shadow-2xl shadow-emerald-500/10 overflow-hidden flex flex-col h-[85vh] sm:h-[600px]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-none p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50 dark:bg-slate-900/50">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 font-mono text-[9px] sm:text-[10px] uppercase font-black tracking-widest">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                Campaign Candlesticks
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {campaignId ? `Campaign: ${campaignId}` : "No Campaign Selected"}
              </h2>
              <div className="flex items-center space-x-2 pt-1">
                 {['1h', '1d', '1w', '1m', '3m', '6m', '1y', 'all'].map(int => (
                   <button
                     key={int}
                     onClick={() => setInterval(int)}
                     className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${interval === int ? 'bg-indigo-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
                   >
                     {int}
                   </button>
                 ))}
                 
                 {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer ml-3 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                      Load Older
                    </button>
                 )}
              </div>
            </div>
            
            <div className="flex items-start gap-4 sm:gap-6">
              {/* Live Metric */}
              <div className="text-right hidden sm:block">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Current Close
                </div>
                {latestCandle ? (
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="font-mono text-2xl font-black text-slate-900 dark:text-white leading-none">
                      {latestCandle.close.toFixed(2)}
                    </span>
                    <span className={`font-mono text-sm font-bold flex items-center ${changePercent >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {changePercent >= 0 ? <TrendingUp className="w-4 h-4 mr-0.5" /> : <TrendingDown className="w-4 h-4 mr-0.5" />}
                      {changePercent > 0 ? "+" : ""}{changePercent.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <div className="font-mono text-xl font-bold text-slate-500">
                    --
                  </div>
                )}
              </div>
            
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-slate-200/50 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Chart Area */}
          <div className="flex-1 p-2 sm:p-4 bg-slate-100 dark:bg-[#030406] relative flex flex-col justify-center">
             {error ? (
               <div className="flex flex-col items-center justify-center text-rose-500 gap-2 p-8 text-center bg-rose-500/10 rounded-xl max-w-sm mx-auto">
                 <Activity className="w-6 h-6" />
                 <span className="font-mono text-xs uppercase font-bold tracking-widest leading-relaxed">
                   {error instanceof Error ? error.message : String(error)}
                 </span>
               </div>
             ) : isLoading && candles.length === 0 ? (
               <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                 <RefreshCw className="w-5 h-5 animate-spin" />
                 <span className="font-mono text-[10px] uppercase tracking-widest">Loading Market Data...</span>
               </div>
             ) : (
               <VotingCandlestickChart candles={candles} />
             )}
          </div>
          
          <div className="p-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center font-mono text-[9px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
            <BarChart2 className="w-3 h-3" />
            Stock market representation of historical campaign total metrics.
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default Q1CandlestickModal;
