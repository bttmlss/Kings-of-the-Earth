import React, { useState } from "react";
import { X, Activity, TrendingUp, TrendingDown, Clock, BarChart2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useUserCandles } from "../hooks/useUserCandles";
import VotingCandlestickChart from "./VotingCandlestickChart";

interface UserCandlestickModalProps {
  onClose: () => void;
  userId?: string;
}

const UserCandlestickModal: React.FC<UserCandlestickModalProps> = ({ onClose, userId }) => {
  const [interval, setInterval] = useState("1h");
  const { candles, isLoading, hasMore, loadMore, error } = useUserCandles(userId, interval);

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
                User Analytics
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Profile Valuation
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
                className="p-2 -mr-2 -mt-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Chart Content */}
          <div className="flex-1 min-h-0 bg-white dark:bg-[#07080b] p-4 sm:p-6 flex flex-col relative overflow-hidden">
            {isLoading && candles.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-10">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 font-mono text-xs uppercase tracking-widest">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading Data...
                </div>
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-10">
                <div className="text-rose-500 font-mono text-xs uppercase tracking-widest bg-rose-500/10 px-4 py-2 rounded-lg">
                  Failed to load chart data
                </div>
              </div>
            ) : candles.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <BarChart2 className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-mono text-xs uppercase tracking-widest">No trading data available</p>
              </div>
            ) : null}

            {/* D3 Chart Container */}
            <div className="flex-1 w-full h-full relative z-0">
               <VotingCandlestickChart candles={candles} />
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UserCandlestickModal;
