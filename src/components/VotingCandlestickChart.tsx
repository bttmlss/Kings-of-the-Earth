import React, { useState, useRef, useMemo, useEffect } from "react";
import { VotingCandle } from "../types";

interface VotingCandlestickChartProps {
  candles: VotingCandle[];
  isUp?: boolean;
}

export default function VotingCandlestickChart({ candles }: VotingCandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Panning & Zooming state
  const [viewWindow, setViewWindow] = useState<{ start: number, end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);

  // Initialize viewWindow to show latest 90 candles or all if less
  useEffect(() => {
    if (!viewWindow && candles && candles.length > 0) {
      setViewWindow({
        start: Math.max(0, candles.length - 90),
        end: candles.length
      });
    } else if (viewWindow && candles && candles.length > viewWindow.end) {
      // If new candles are added, shift window right!
      const diff = candles.length - viewWindow.end;
      setViewWindow({
        start: viewWindow.start + diff,
        end: candles.length
      });
    }
  }, [candles?.length]);

  // Active view window
  const startIdx = viewWindow ? Math.max(0, viewWindow.start) : 0;
  const endIdx = viewWindow ? Math.min(candles.length, viewWindow.end) : candles.length;
  
  // The visible slice
  const visibleCandles = candles.slice(startIdx, endIdx);

  // viewBox Dimensions
  const viewWidth = 500;
  const viewHeight = 200;

  // Render Padding & usabilities
  const paddingLeft = 15;
  const paddingRight = 15;
  const paddingTop = 25;
  const paddingBottom = 15;

  const plotWidth = viewWidth - paddingLeft - paddingRight;
  const plotHeight = viewHeight - paddingTop - paddingBottom;

  const highs = visibleCandles.map((c) => c.high);
  const lows = visibleCandles.map((c) => c.low);
  const maxVal = Math.max(...highs, 1);
  const minVal = Math.min(...lows);

  const diffVal = maxVal - minVal;
  const yMin = Math.max(0, minVal - (diffVal === 0 ? 1 : diffVal * 0.1));
  const yMax = maxVal + (diffVal === 0 ? 1 : diffVal * 0.1);

  // Helper coordinate mapper
  const getY = (val: number) => {
    let y = paddingTop + plotHeight / 2;
    if (yMax !== yMin) {
      y = paddingTop + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
    }
    return y;
  };
  
  const getX = (index: number) => {
    return paddingLeft + (index / Math.max(visibleCandles.length - 1, 1)) * plotWidth;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    
    if (isDragging) {
      // Panning!
      const dx = clientX - dragStartX;
      const shiftPercent = -(dx / rect.width);
      const itemsToShift = shiftPercent * (endIdx - startIdx);
      
      if (Math.abs(itemsToShift) > 1 && viewWindow) {
         let newStart = viewWindow.start + itemsToShift;
         let newEnd = viewWindow.end + itemsToShift;
         
         // Clamp limits
         if (newStart < 0) {
            newEnd -= newStart;
            newStart = 0;
         }
         if (newEnd > candles.length) {
            newStart -= (newEnd - candles.length);
            newEnd = candles.length;
         }
         
         setViewWindow({ start: Math.max(0, newStart), end: Math.max(0, Math.min(candles.length, newEnd)) });
         setDragStartX(clientX); // Reset drag start
      }
      return;
    }

    const relativeX = clientX / rect.width;
    const svgX = relativeX * viewWidth;

    const usableX = svgX - paddingLeft;
    const percentX = usableX / plotWidth;
    let index = Math.round(percentX * Math.max(visibleCandles.length - 1, 1));
    index = Math.max(0, Math.min(visibleCandles.length - 1, index));
    setHoveredIndex(index);
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setHoveredIndex(null);
    }
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDragging(true);
    setDragStartX(e.clientX - rect.left);
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!viewWindow) return;
    
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const currentSpan = viewWindow.end - viewWindow.start;
      
      if (zoomFactor < 1 && currentSpan < 10) return; // Max zoom in (10 candles)
      if (zoomFactor > 1 && currentSpan >= candles.length && viewWindow.start <= 0) return; // Max zoom out
      
      let newSpan = currentSpan * zoomFactor;
      
      // Zoom around center
      const midPoint = viewWindow.start + currentSpan / 2;
      let newStart = midPoint - newSpan / 2;
      let newEnd = midPoint + newSpan / 2;
      
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > candles.length) {
        newStart -= (newEnd - candles.length);
        newEnd = candles.length;
      }
      if (newStart < 0) newStart = 0;
  
      setViewWindow({ start: newStart, end: newEnd });
    } else {
      // Pan naturally
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      
      const currentSpan = viewWindow.end - viewWindow.start;
      const shiftPercent = dx / 1000;
      const itemsToShift = shiftPercent * currentSpan;
      
      if (Math.abs(itemsToShift) > 0.1) {
         let newStart = viewWindow.start + itemsToShift;
         let newEnd = viewWindow.end + itemsToShift;
         
         if (newStart < 0) {
            newEnd -= newStart;
            newStart = 0;
         }
         if (newEnd > candles.length) {
            newStart -= (newEnd - candles.length);
            newEnd = candles.length;
         }
         if (newStart < 0) newStart = 0;
         
         setViewWindow({ start: newStart, end: newEnd });
      }
    }
  };

  // Prevent default scroll when zooming
  useEffect(() => {
     const node = containerRef.current;
     const onWheel = (e: WheelEvent) => {
       e.preventDefault();
     };
     if (node) {
        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
     }
  }, []);

  if (!candles || candles.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-slate-400 font-mono text-[9px] uppercase border border-slate-200/50 dark:border-slate-800/50 rounded-xl bg-slate-500/[0.02]">
        [ No metrics logged ]
      </div>
    );
  }

  const activePoint = hoveredIndex !== null && visibleCandles[hoveredIndex] ? visibleCandles[hoveredIndex] : null;
  const activeCo = hoveredIndex !== null && activePoint ? { x: getX(hoveredIndex), y: getY(activePoint.close) } : null;

  const formatDateLabel = (dateStr: string) => {
    let datePart = dateStr;
    let hourPart = "";
    
    if (dateStr.includes("T")) {
      const parts = dateStr.split("T");
      datePart = parts[0];
      hourPart = parts[1];
    }
    
    const parts = datePart.split("-");
    if (parts.length === 3) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      let mIdx = parseInt(parts[1], 10);
      if (isNaN(mIdx)) return dateStr;
      mIdx -= 1;
      const day = parseInt(parts[2], 10);
      
      let label = `${monthNames[mIdx]} ${day}`;
      if (hourPart) {
        label += ` ${hourPart}:00`;
      }
      return label;
    }
    return dateStr;
  };

  const candleWidth = Math.max(1, (plotWidth / Math.max(visibleCandles.length, 1)) * 0.6);

  return (
    <div ref={containerRef} className="relative w-full h-[300px] select-none" onWheel={handleWheel}>
      {/* SVG Container */}
      <svg
        className={`w-full h-full overflow-visible ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {/* Horizontal reference threshold lines */}
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft + plotWidth} y2={paddingTop} stroke="rgba(148, 163, 184, 0.04)" strokeWidth="1" />
        <line x1={paddingLeft} y1={paddingTop + plotHeight / 2} x2={paddingLeft + plotWidth} y2={paddingTop + plotHeight / 2} stroke="rgba(148, 163, 184, 0.04)" strokeWidth="1" />
        <line x1={paddingLeft} y1={paddingTop + plotHeight} x2={paddingLeft + plotWidth} y2={paddingTop + plotHeight} stroke="rgba(148, 163, 184, 0.04)" strokeWidth="1" />

        {/* Candles */}
        {visibleCandles.map((candle, i) => {
          const x = getX(i);
          const yOpen = getY(candle.open);
          const yClose = getY(candle.close);
          const yHigh = getY(candle.high);
          const yLow = getY(candle.low);
          
          const isUp = candle.close >= candle.open;
          const color = isUp ? "#00ffb4" : "#f43f5e";
          
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
          
          return (
            <g key={candle.id || i} className="pointer-events-none transition-transform duration-75">
              {/* Wick */}
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1} opacity={0.8} />
              {/* Body */}
              <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={isUp ? color : "transparent"} stroke={color} strokeWidth={1.5} rx={0.5} />
            </g>
          );
        })}

        {/* Active hovered crosshairs guide */}
        {activeCo && activePoint && !isDragging && (
          <g className="pointer-events-none animate-fade-in">
            <line x1={activeCo.x} y1={paddingTop} x2={activeCo.x} y2={paddingTop + plotHeight} stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1.25" strokeDasharray="4,4" />
            <line x1={paddingLeft} y1={activeCo.y} x2={paddingLeft + plotWidth} y2={activeCo.y} stroke="rgba(148, 163, 184, 0.15)" strokeWidth="0.75" strokeDasharray="2,2" />
            <circle cx={activeCo.x} cy={activeCo.y} r="5" fill={activePoint.close >= activePoint.open ? "#00ffb4" : "#f43f5e"} opacity="0.3" className="animate-ping" />
            <circle cx={activeCo.x} cy={activeCo.y} r="3" fill="#ffffff" stroke={activePoint.close >= activePoint.open ? "#00ffb4" : "#f43f5e"} strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {/* Floating high-fidelity absolute HTML Tooltip display */}
      {activePoint && activeCo && !isDragging && (
        <div
          className="absolute z-30 pointer-events-none bg-slate-950/95 dark:bg-[#06080e]/95 border border-slate-800 rounded-lg p-2.5 shadow-xl transition-all duration-75 flex flex-col items-start gap-1"
          style={{
            left: `${Math.min(Math.max(10, (activeCo.x / viewWidth) * 100 - 15), 70)}%`,
            top: `${Math.max(5, (activeCo.y / viewHeight) * 100 - 45)}%`,
          }}
        >
          <span className="text-[7.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">
            {activePoint.id ? formatDateLabel(activePoint.id) : "Candle"}
          </span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-500 uppercase font-bold">O</span>
              <span className="text-[10px] font-mono text-white font-black">{activePoint.open}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-500 uppercase font-bold">H</span>
              <span className="text-[10px] font-mono text-white font-black">{activePoint.high}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-500 uppercase font-bold">L</span>
              <span className="text-[10px] font-mono text-white font-black">{activePoint.low}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-500 uppercase font-bold">C</span>
              <span className="text-[10px] font-mono font-black" style={{ color: activePoint.close >= activePoint.open ? "#00ffb4" : "#f43f5e" }}>
                {activePoint.close}
              </span>
            </div>
          </div>
          {activePoint.volume > 0 && (
            <span className="text-[8px] text-emerald-400 font-extrabold uppercase mt-1">
              +{activePoint.volume} votes logged
            </span>
          )}
        </div>
      )}
      
      {!isDragging && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none opacity-50">
          <span className="text-[8px] font-mono text-slate-400">SCROLL TO ZOOM / DRAG TO PAN</span>
          <span className="text-[8px] font-mono text-slate-500">SHOWING {Math.floor(startIdx)} TO {Math.floor(endIdx)}</span>
        </div>
      )}
    </div>
  );
}
