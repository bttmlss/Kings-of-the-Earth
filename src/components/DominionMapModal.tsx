import React, { useState, useEffect } from "react";
import { X, Globe, Search, RefreshCw, Layers } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface UserContestStats {
  campaignId: string;
  domainTitle: string;
}

interface VoteHeatPoint {
  lat: number;
  lon: number;
  campaignTitle: string;
}

interface DominionMapModalProps {
  onClose: () => void;
  userId: string;
  userDomains: UserContestStats[];
}

function MapBoundsUpdater({ points }: { points: VoteHeatPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = points.map(p => [p.lat, p.lon] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }, [points, map]);
  return null;
}

export default function DominionMapModal({ onClose, userId, userDomains }: DominionMapModalProps) {
  const [selectedDomainId, setSelectedDomainId] = useState<string | "all">(
    userDomains.length > 0 ? "all" : ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [heatPoints, setHeatPoints] = useState<VoteHeatPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const filteredDomains = userDomains.filter(d => 
    d.domainTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    async function loadVoteLocations() {
      if (!selectedDomainId && selectedDomainId !== "all") return;
      setIsLoading(true);
      
      const loadedPoints: VoteHeatPoint[] = [];

      try {
        if (selectedDomainId === "all") {
          // fetch all campaigns the user is in
          for (const dom of userDomains) {
            const votesRef = collection(db, "campaigns", dom.campaignId, "votes");
            const snap = await getDocs(votesRef);
            snap.forEach(doc => {
              const data = doc.data();
              // All votes, actually any vote in this domain count towards the "where votes are coming from"
              // The prompt says "real map that uses the GPS ping data whenever a user votes so that we know exactly where they came from on the globe"
              // We'll show all votes for the domains the user is a part of to show where the user's supporters are located!
              if (data.latitude != null && data.longitude != null) {
                loadedPoints.push({ lat: data.latitude, lon: data.longitude, campaignTitle: dom.domainTitle });
              }
            });
          }
        } else {
          // fetch a single specific domain
          const dom = userDomains.find(d => d.campaignId === selectedDomainId);
          if (dom) {
            const votesRef = collection(db, "campaigns", selectedDomainId, "votes");
            const snap = await getDocs(votesRef);
            snap.forEach(doc => {
              const data = doc.data();
              if (data.latitude != null && data.longitude != null) {
                loadedPoints.push({ lat: data.latitude, lon: data.longitude, campaignTitle: dom.domainTitle });
              }
            });
          }
        }

        // Only display real coordinates gathered from actual votes.
        setHeatPoints(loadedPoints);
      } catch (err) {
        console.error("Failed to load vote locations:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadVoteLocations();
  }, [selectedDomainId, userDomains]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md sm:p-6 pb-24 sm:pb-6">
      <div className="bg-slate-100 dark:bg-[#040507] w-full max-w-2xl max-h-[90vh] aspect-square rounded-2xl shadow-xl flex border border-slate-300 dark:border-slate-800 overflow-hidden font-mono flex-col relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Real Interactive Map container */}
        <div className="w-full h-full relative z-10 flex flex-col">
          
          {/* Top Border Header / Search Bar */}
          <div className="w-full h-16 sm:h-20 shrink-0 border-b border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#07080b] flex items-center justify-between px-4 sm:px-6 relative z-[400]">
            <div className="flex items-center gap-2 text-amber-500 font-bold uppercase tracking-wider text-[10px] sm:text-xs">
              <Globe className="w-4 h-4 sm:w-5 sm:h-5" /> GPS Filter
            </div>

            <div className="relative group w-[50%] max-w-[250px] sm:max-w-[300px]">
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
              <input
                type="text"
                placeholder="Search dominions..."
                value={searchQuery}
                onFocus={() => {
                  if (!searchQuery) {
                    setSearchQuery(""); // trigger if needed
                  }
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md py-1.5 sm:py-2 pl-9 pr-6 sm:pr-8 text-[10px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800 dark:text-slate-200 uppercase tracking-tighter"
              />
              {searchQuery && (
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedDomainId("all");
                  }} 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Dropdown Menu */}
              {searchQuery.length > 0 && (
                <div className="absolute top-full mt-1 sm:mt-2 left-0 right-0 max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl py-1 scrollbar-thin scrollbar-thumb-amber-500/50">
                  <button
                    onClick={() => {
                      setSelectedDomainId("all");
                      setSearchQuery("");
                    }}
                    className={`w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      selectedDomainId === "all" ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-slate-800" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> All Domains
                    </span>
                  </button>
                  {filteredDomains.map(d => {
                    const isSelected = selectedDomainId === d.campaignId;
                    const cleanName = d.domainTitle.replace(/^(king|queen)\s+of\s*\.*/i, "").trim();
                    return (
                      <button
                        key={d.campaignId}
                        onClick={() => {
                          setSelectedDomainId(d.campaignId);
                          setSearchQuery(cleanName);
                        }}
                        className={`w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors truncate ${
                          isSelected ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-slate-800" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {cleanName}
                      </button>
                    );
                  })}
                  {filteredDomains.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-slate-500 uppercase">No matches</div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="flex-1 w-full bg-slate-200 dark:bg-[#040507] relative z-10">
             <div className="w-full h-full overflow-hidden relative isolate z-10">
                <MapContainer center={[20, 0]} zoom={2} style={{ height: "100%", width: "100%", zIndex: 10 }}>
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  />
                  {heatPoints.map((pt, i) => (
                    <CircleMarker
                      key={i}
                      center={[pt.lat, pt.lon]}
                      pathOptions={{ color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.6 }}
                      radius={5}
                    >
                      <Popup>
                        <div className="font-mono text-xs uppercase font-bold text-slate-800">
                           {pt.campaignTitle}<br/>
                           <span className="opacity-70">Ping [{pt.lat.toFixed(2)}, {pt.lon.toFixed(2)}]</span>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                  <MapBoundsUpdater points={heatPoints} />
                </MapContainer>
             </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
