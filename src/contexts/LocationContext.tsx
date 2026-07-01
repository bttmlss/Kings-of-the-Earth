import React, { createContext, useContext, useEffect, useState } from "react";

interface LocationContextType {
  currentCity: string | null;
  validLocations: string[];
  latitude: number | null;
  longitude: number | null;
  lastPingAt: Date | null;
  pingError: string | null;
  forcePing: () => void;
}

const LocationContext = createContext<LocationContextType>({
  currentCity: null,
  validLocations: [],
  latitude: null,
  longitude: null,
  lastPingAt: null,
  pingError: null,
  forcePing: () => {},
});

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [validLocations, setValidLocations] = useState<string[]>([]);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [lastPingAt, setLastPingAt] = useState<Date | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  const fetchCityFromCoords = async (lat: number, lon: number) => {
    try {
      setLatitude(lat);
      setLongitude(lon);
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const data = await res.json();
      const addr = data.address;
      
      if (addr) {
        const city = addr.city || addr.town || addr.village || addr.county || addr.state;
        const locations = [
          addr.city, addr.town, addr.village, addr.county, addr.state, addr.country
        ].filter(Boolean).map((s: string) => s.toLowerCase());

        if (city) {
          setCurrentCity(city.toLowerCase());
          setValidLocations(locations);
          setLastPingAt(new Date());
          setPingError(null);
        } else {
          setPingError("Could not determine city from coordinates.");
        }
      } else {
        setPingError("Could not determine location from coordinates.");
      }
    } catch (err) {
      setPingError("Failed to reverse geocode location.");
    }
  };

  const forcePing = () => {
    if (!navigator.geolocation) {
      setPingError("Geolocation is not supported by your browser.");
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          // Obfuscate location for security reasons (approximate to ~5-10km radius)
          const approxLat = Number(latitude.toFixed(2)) + (Math.random() * 0.04 - 0.02);
          const approxLon = Number(longitude.toFixed(2)) + (Math.random() * 0.04 - 0.02);
          fetchCityFromCoords(approxLat, approxLon);
        },
        (err) => {
          setPingError("Failed to acquire GPS location. Please ensure location services are enabled.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err: any) {
      console.warn("Synchronous Geolocation access block/error caught:", err);
      setPingError("Failed to acquire GPS location: Permission or boundary limits.");
    }
  };

  useEffect(() => {
    // Initial ping
    // Commented out to avoid auto-pinging immediately on load until user gives permission, 
    // but the requirement says "pinged every hour they are on the app"
    forcePing();

    // Ping every hour
    const interval = setInterval(() => {
      forcePing();
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <LocationContext.Provider value={{ currentCity, validLocations, latitude, longitude, lastPingAt, pingError, forcePing }}>
      {children}
    </LocationContext.Provider>
  );
}

export const useLocationPing = () => useContext(LocationContext);
