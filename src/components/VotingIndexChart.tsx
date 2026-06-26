import React, { useState, useRef, useEffect } from "react";
import { DataPoint } from "../hooks/useVotingIndex";

interface VotingIndexChartProps {
  points: DataPoint[];
  isUp: boolean;
}

export default function VotingIndexChart({ points, isUp }: VotingIndexChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Panning & Zooming state
  const [viewWindow, setViewWindow] = useState<{ start: number, end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);

  // Initialize viewWindow to show latest 90 points or all if less
  useEffect(() => {
    if (!viewWindow && points.length > 0) {
      setViewWindow({
        start: Math.max(0, points.length - 90),
        end: points.length
      });
    } else if (viewWindow && points.length > viewWindow.end) {
      const diff = points.length - viewWindow.end;
      setViewWindow({
        start: viewWindow.start + diff,
        end: points.length
      });
    }
  }, [points.length]);

  if (!points || points.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-slate-400 font-mono text-[9px] uppercase">
        [ No metrics logged ]
      </div>
    );
  }

  const startIdx = viewWindow ? Math.max(0, viewWindow.start) : 0;
  const endIdx = viewWindow ? Math.min(points.length, viewWindow.end) : points.length;
  const visiblePoints = points.slice(Math.floor(startIdx), Math.ceil(endIdx));

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

  const values = visiblePoints.map((p) => p.cumulative);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values);

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
    return paddingLeft + (index / Math.max(visiblePoints.length - 1, 1)) * plotWidth;
  };

  const coords = visiblePoints.map((p, i) => ({
    x: getX(i),
    y: getY(p.cumulative)
  }));
  
  let linePath = "";
  if (coords.length > 0) {
    linePath = `M ${coords[0].x} ${coords[0].y} ` + coords.slice(1).map((c) => `L ${c.x} ${c.y}`).join(" ");
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    
    if (isDragging) {
      const dx = clientX - dragStartX;
      const shiftPercent = -(dx / rect.width);
      const itemsToShift = shiftPercent * (endIdx - startIdx);
      
      if (Math.abs(itemsToShift) > 1 && viewWindow) {
         let newStart = viewWindow.start + itemsToShift;
         let newEnd = viewWindow.end + itemsToShift;
         
         if (newStart < 0) {
            newEnd -= newStart;
            newStart = 0;
         }
         if (newEnd > points.length) {
            newStart -= (newEnd - points.length);
            newEnd = points.length;
         }
         
         setViewWindow({ start: Math.max(0, newStart), end: Math.max(0, Math.min(points.length, newEnd)) });
         setDragStartX(clientX); 
      }
      return;
    }

    const relativeX = clientX / rect.width;
    const svgX = relativeX * viewWidth;

    const usableX = svgX - paddingLeft;
    const percentX = usableX / plotWidth;
    let index = Math.round(percentX * Math.max(visiblePoints.length - 1, 1));
    index = Math.max(0, Math.min(visiblePoints.length - 1, index));
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
      
      if (zoomFactor < 1 && currentSpan < 5) return; // Max zoom in
      if (zoomFactor > 1 && currentSpan >= points.length && viewWindow.start <= 0) return; // Max zoom out
      
      let newSpan = currentSpan * zoomFactor;
      
      const midPoint = viewWindow.start + currentSpan / 2;
      let newStart = midPoint - newSpan / 2;
      let newEnd = midPoint + newSpan / 2;
      
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > points.length) {
        newStart -= (newEnd - points.length);
        newEnd = points.length;
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
         if (newEnd > points.length) {
            newStart -= (newEnd - points.length);
            newEnd = points.length;
         }
         if (newStart < 0) newStart = 0;
         
         setViewWindow({ start: newStart, end: newEnd });
      }
    }
  };

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

  const activePoint = hoveredIndex !== null && visiblePoints[hoveredIndex] ? visiblePoints[hoveredIndex] : null;
  const activeCo = hoveredIndex !== null && activePoint ? coords[hoveredIndex] : null;

  const themeColor = isUp ? "#00ffb4" : "#f43f5e";

  const formatDateLabel = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      let mIdx = parseInt(parts[1], 10);
      if (isNaN(mIdx)) return dateStr;
      mIdx -= 1;
      const day = parseInt(parts[2], 10);
      return `${monthNames[mIdx]} ${day}`;
    }
    return dateStr;
  };

  return (
    <div ref={containerRef} className="relative w-full h-[180px] sm:h-[200px] select-none" onWheel={handleWheel}>
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

        {/* Stroke Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={themeColor}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-75 pointer-events-none"
          />
        )}

        {/* Active hovered crosshairs guide */}
        {activeCo && activePoint && !isDragging && (
          <g className="pointer-events-none animate-fade-in">
            <line
              x1={activeCo.x} y1={paddingTop} x2={activeCo.x} y2={paddingTop + plotHeight}
              stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1.25" strokeDasharray="4,4"
            />
            <line
              x1={paddingLeft} y1={activeCo.y} x2={paddingLeft + plotWidth} y2={activeCo.y}
              stroke="rgba(148, 163, 184, 0.15)" strokeWidth="0.75" strokeDasharray="2,2"
            />
            <circle cx={activeCo.x} cy={activeCo.y} r="5" fill={themeColor} opacity="0.3" className="animate-ping" />
            <circle cx={activeCo.x} cy={activeCo.y} r="3" fill="#ffffff" stroke={themeColor} strokeWidth="1.5" />
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
            {activePoint.date ? formatDateLabel(activePoint.date) : "Point"}
          </span>
          <div className="flex flex-col gap-1 w-full mt-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Vol Index</span>
              <span className="text-[12px] font-mono font-black" style={{ color: themeColor }}>
                {activePoint.cumulative}
              </span>
            </div>
          </div>
          {activePoint.count > 0 && (
            <span className="text-[8px] text-emerald-400 font-extrabold uppercase mt-1">
              +{activePoint.count} votes logged
            </span>
          )}
        </div>
      )}

      {!isDragging && points.length > 90 && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none opacity-50">
          <span className="text-[8px] font-mono text-slate-400">SCROLL TO ZOOM / DRAG TO PAN</span>
          <span className="text-[8px] font-mono text-slate-500">SHOWING {Math.floor(startIdx)} TO {Math.floor(endIdx)}</span>
        </div>
      )}
    </div>
  );
}
export type { DataPoint };
