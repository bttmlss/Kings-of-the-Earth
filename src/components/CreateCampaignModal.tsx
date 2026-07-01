import React, { useState, useEffect, useRef } from "react";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Sparkles, X, ChevronRight, CheckCircle2, ShieldAlert, Award, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "../contexts/ToastContext";
import { Campaign } from "../types";
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

function LocationAutocompleteInput({ 
  prefix, 
  onPrefixChange,
  value, 
  onChange, 
  disabled 
}: { 
  prefix: string;
  onPrefixChange: (val: "King of" | "Queen of") => void;
  value: string; 
  onChange: (val: string) => void;
  disabled: boolean;
}) {
  const placesLib = useMapsLibrary('places');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!placesLib || !value.trim()) {
      setPredictions([]);
      return;
    }
    
    let isActive = true;
    const fetchSuggestions = async () => {
      try {
        const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value });
        if (isActive && suggestions) {
          setPredictions(suggestions.map((s: any) => s.placePrediction).filter(Boolean));
        }
      } catch (err) {
        if (isActive) setPredictions([]);
      }
    };
    
    fetchSuggestions();
    
    return () => { isActive = false; };
  }, [value, placesLib]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full flex rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all bg-white dark:bg-slate-900" ref={wrapperRef}>
      <select
        value={prefix}
        onChange={(e) => onPrefixChange(e.target.value as any)}
        className="bg-slate-50 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-700 py-3.5 pl-4 pr-3 text-sm font-semibold text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors rounded-l-xl"
      >
        <option value="King of">King of...</option>
        <option value="Queen of">Queen of...</option>
      </select>
      <input
        type="text"
        placeholder="e.g. Tokyo, New York, The Moon"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        disabled={disabled}
        className="w-full px-4 py-3.5 bg-transparent text-sm focus:outline-none font-semibold text-slate-800 dark:text-slate-100 rounded-r-xl"
      />
      
      <AnimatePresence>
        {isOpen && predictions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 divide-y divide-slate-100 dark:divide-slate-800/50"
          >
            {predictions.map((p) => {
              const mainStr = p.mainText?.text || p.text?.text || "";
              const secStr = p.secondaryText?.text || "";
              const fullStr = p.text?.text || mainStr;
              
              return (
              <div
                key={p.placeId}
                onClick={() => {
                  onChange(fullStr);
                  setIsOpen(false);
                }}
                className="px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex items-center gap-2.5 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <MapPin className="w-3 h-3 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{mainStr}</div>
                  {secStr && <div className="text-[10px] text-slate-500 truncate">{secStr}</div>}
                </div>
              </div>
            )})}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CreateCampaignModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onSuccess: (newCampaign: Campaign) => void;
}

const EXAMPLES = [
  { text: "developers", category: "Cultures (Persons)" },
  { text: "Tokyo", category: "Locations (Places)" },
  { text: "keyboards", category: "Objects (Things)" },
  { text: "coding", category: "Actions (Verbs)" },
  { text: "Vikings", category: "Cultures (Persons)" },
  { text: "Mars", category: "Locations (Places)" },
  { text: "kittens", category: "Objects (Things)" },
  { text: "singing", category: "Actions (Verbs)" },
  { text: "gamers", category: "Cultures (Persons)" },
  { text: "Brooklyn", category: "Locations (Places)" },
  { text: "guitars", category: "Objects (Things)" },
  { text: "running", category: "Actions (Verbs)" }
];

export default function CreateCampaignModal({
  userId,
  userName,
  onClose,
  onSuccess,
}: CreateCampaignModalProps) {
  const [isRulesExpanded, setIsRulesExpanded] = useState(false);
  const [campaignMode, setCampaignMode] = useState<"general" | "location">("general");
  const [prefix, setPrefix] = useState<"King of" | "Queen of">("King of");
  const [domainPayload, setDomainPayload] = useState("");
  const { showError } = useToast();
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [domainType, setDomainType] = useState<string | null>(null);
  const [pendingTime, setPendingTime] = useState<"none" | "24hours" | "72hours" | "upon_approval">("none");

  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIndex((prev) => (prev + 1) % EXAMPLES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const currentExample = EXAMPLES[exampleIndex];

  // Derive a URL/ID slug based on combined domain title to enforce 1-of-1 uniqueness
  const getFulltitle = () => {
    const rawDomain = domainPayload.trim();
    if (!rawDomain) return "";
    return rawDomain; // the domain is just the subject (e.g., florida, basketball)
  };

  const getSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  };

  const handleValidate = async () => {
    const title = getFulltitle();
    if (!domainPayload.trim() || domainPayload.trim().length < 3) {
      showError("Please key in a domain title of at least 3 characters.");
      return;
    }

    if (campaignMode === "location") {
      setIsValidated(true);
      setDomainType("Locations (Places)");
      setAiAnalysis(`Location verified: Classified as "Locations (Places)". Safe for public coronation.`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setAiAnalysis(null);
    setIsValidated(false);

    try {
      const response = await fetch("/api/validate-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainTitle: title, campaignMode }),
      });

      if (!response.ok) {
        throw new Error("Unable to contact AI validation server.");
      }

      const data = await response.json();
      if (!data.isValid) {
        showError(data.reason || "Linguistic constraints violated. Suffix must be: Persons/Cultures, Places/locations, plural Things/Objects, or Verbs/Actions ending in -ing.");
        setIsValidated(false);
      } else {
        setIsValidated(true);
        setDomainType(data.domainType || "Miscellaneous");
        setAiAnalysis(`Linguistic audit passed: Classified as "${data.domainType}". Safe for public coronation.`);
      }
    } catch (err: any) {
      console.error(err);
      showError("An unexpected validation failure occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidated) return;

    const title = getFulltitle();
    const slug = getSlug(title);

    setIsLoading(true);
    setError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");

      const createRes = await fetch("/api/create-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          domainTitle: title,
          domainType,
          slug,
          prefix,
          pendingTime,
          isVerified: campaignMode === "location"
        })
      });

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create campaign");
      }

      const newCampaign: Campaign = {
        id: slug,
        domainTitle: title,
        creatorId: userId,
        creatorName: userName,
        createdAt: new Date(), // Local fallback
        status: "live",
        domainType: (domainType as any) || "Miscellaneous",
        pendingTime: pendingTime,
        isVerified: campaignMode === "location"
      };

      onSuccess(newCampaign);
    } catch (err: any) {
      console.error("Create campaign error:", err);
      showError(err.message || "Failed to crown the new campaign in the ledger. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-lg max-h-[85vh] sm:max-h-[90vh] bg-slate-200 dark:bg-slate-700 rounded-3xl overflow-hidden border border-slate-400 dark:border-slate-500 shadow-2xl flex flex-col"
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-400 dark:border-slate-500/80 flex items-center justify-between bg-slate-200 dark:bg-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50/10 flex items-center justify-center text-amber-600">
              <Award className="w-5.5 h-5.5" />
            </div>
            <div>
              <h2 className="font-display font-medium text-lg text-slate-800 dark:text-slate-100">
                Create Domain
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-300">Claims must abide by grammatical laws</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer text-slate-500 hover:text-slate-750 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-grow overflow-y-auto">
          {/* Rules Reminder Banner */}
          <div className="rounded-xl bg-slate-300/40 dark:bg-slate-800/40 border border-slate-400 dark:border-slate-500 overflow-hidden text-xs text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => setIsRulesExpanded(!isRulesExpanded)}
              className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors"
            >
              <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
                👑 Royal Ledger Grammar Laws
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isRulesExpanded ? "rotate-90" : ""}`} />
            </button>
            <AnimatePresence>
              {isRulesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 overflow-hidden"
                >
                  <ul className="list-disc pl-4 space-y-1 mt-1">
                    <li>Must strictly belong to one of four domain categories:</li>
                    <li><span className="font-semibold text-slate-700 dark:text-slate-300">Persons (Cultures)</span>: Groups or professions (e.g. "developers", "Vikings") but NOT individual proper names (e.g. "Sarah", "Mike").</li>
                    <li><span className="font-semibold text-slate-700 dark:text-slate-300">Places (locations)</span>: Real-world, geographic locations verified by AI.</li>
                    <li><span className="font-semibold text-slate-700 dark:text-slate-300">Thing (Objects)</span>: Plural standard collection nouns (e.g. "keyboards", "kittens").</li>
                    <li><span className="font-semibold text-slate-700 dark:text-slate-300">Verbs (Actions)</span>: Action nouns ending in <span className="font-semibold text-slate-700 dark:text-slate-300">"-ing"</span> (e.g. "coding", "singing").</li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Campaign Mode Tabs */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setCampaignMode("general");
                setDomainPayload("");
                setIsValidated(false);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                campaignMode === "general" 
                  ? "bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              General Based
            </button>
            <button
              type="button"
              onClick={() => {
                setCampaignMode("location");
                setDomainPayload("");
                setIsValidated(false);
                setDomainType("Locations (Places)");
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                campaignMode === "location" 
                  ? "bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100" 
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Location Based
            </button>
          </div>

          {/* Domain text payload */}
          <div className="space-y-2 col-span-2 mt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="domainName" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Enter Domain
              </label>
            </div>
            
            {campaignMode === "general" ? (
              <div className="relative w-full flex rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-500/10 transition-all bg-white dark:bg-slate-900">
                <select
                  value={prefix}
                  onChange={(e) => {
                    setPrefix(e.target.value as "King of" | "Queen of");
                    setIsValidated(false);
                  }}
                  className="bg-slate-50 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-700 py-3.5 pl-4 pr-3 text-sm font-semibold text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors rounded-l-xl"
                >
                  <option value="King of">King of...</option>
                  <option value="Queen of">Queen of...</option>
                </select>
                <input
                  id="domainName"
                  type="text"
                  placeholder={`e.g. ${currentExample.text}`}
                  value={domainPayload}
                  onChange={(e) => {
                    setDomainPayload(e.target.value);
                    setIsValidated(false);
                    setError(null);
                    setAiAnalysis(null);
                  }}
                  disabled={isLoading}
                  className="w-full px-4 py-3.5 bg-transparent text-sm focus:outline-none font-semibold text-slate-800 dark:text-slate-100 rounded-r-xl"
                />
              </div>
            ) : (
              <LocationAutocompleteInput
                prefix={prefix}
                onPrefixChange={(val) => {
                  setPrefix(val);
                  setIsValidated(false);
                }}
                value={domainPayload}
                onChange={(val) => {
                  setDomainPayload(val);
                  setIsValidated(false);
                  setError(null);
                  setAiAnalysis(null);
                }}
                disabled={isLoading}
              />
            )}
            
            <p className="text-[11px] text-slate-400 italic">
              Example: <span className="font-semibold text-slate-600">{prefix} {domainPayload || (campaignMode === "location" ? "Tokyo" : currentExample.text)}</span>
            </p>
          </div>


          {/* Error and validation reporting */}
          <AnimatePresence mode="wait">

            {aiAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-start gap-2.5 text-emerald-800 text-xs"
              >
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-emerald-500" />
                <span>{aiAnalysis}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Modal Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium text-xs hover:bg-slate-100 cursor-pointer"
            >
              Retreat
            </button>

            {!isValidated ? (
              <button
                type="button"
                onClick={handleValidate}
                disabled={isLoading || !domainPayload.trim()}
                className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-800 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isLoading ? "Auditing..." : (campaignMode === "location" ? "Verify Location" : "Run AI Grammar Audit")}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                id="crown-btn"
                type="submit"
                disabled={isLoading}
                className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-500/15"
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
                {isLoading ? "Posting Domain..." : "Build Live Kingdom"}
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );

  return hasValidKey ? (
    <APIProvider apiKey={API_KEY}>
      {modalContent}
    </APIProvider>
  ) : (
    modalContent
  );
}
