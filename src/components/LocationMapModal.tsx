import React, { useEffect, useState } from "react";
import { X, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { APIProvider, Map, useMapsLibrary, AdvancedMarker } from '@vis.gl/react-google-maps';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface LocationMapModalProps {
  locationName: string;
  onClose: () => void;
}

function LocationMapInner({ locationName }: { locationName: string }) {
  const placesLib = useMapsLibrary('places');
  const [center, setCenter] = useState<google.maps.LatLngLiteral | null>(null);

  useEffect(() => {
    if (!placesLib || !locationName) return;

    const findPlace = async () => {
      const geocoder = new google.maps.Geocoder();
      try {
        const response = await geocoder.geocode({ address: locationName });
        if (response.results && response.results.length > 0) {
          const loc = response.results[0].geometry.location;
          setCenter({ lat: loc.lat(), lng: loc.lng() });
        }
      } catch (err) {
        console.error("Geocoding error:", err);
      }
    };
    findPlace();
  }, [placesLib, locationName]);

  if (!center) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <MapPin className="w-8 h-8 text-amber-500 opacity-50" />
          <span className="text-xs font-mono text-slate-500 font-semibold tracking-wider">LOCATING...</span>
        </div>
      </div>
    );
  }

  return (
    <Map
      defaultZoom={12}
      defaultCenter={center}
      mapId="DEMO_MAP_ID"
      gestureHandling="greedy"
      disableDefaultUI={true}
    >
      <AdvancedMarker position={center}>
        <div className="bg-amber-500 p-2 rounded-full shadow-lg border-2 border-white dark:border-slate-800 text-white">
          <MapPin className="w-5 h-5" />
        </div>
      </AdvancedMarker>
    </Map>
  );
}

export default function LocationMapModal({ locationName, onClose }: LocationMapModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col"
        style={{ height: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                Domain Map
              </h2>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                {locationName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-slate-100 dark:bg-slate-800">
          {hasValidKey ? (
            <APIProvider apiKey={API_KEY}>
              <LocationMapInner locationName={locationName} />
            </APIProvider>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Maps API Key Required
              </p>
              <p className="text-xs text-slate-500 mt-2 max-w-sm">
                To view real-world maps, configure the Google Maps Platform API key.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
