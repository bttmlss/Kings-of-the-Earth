import React, { useState, useEffect } from "react";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import { Sparkles, X, ChevronRight, CheckCircle2, ShieldAlert, Award } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Campaign } from "../types";

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
  const [prefix, setPrefix] = useState<"King of" | "Queen of">("King of");
  const [domainPayload, setDomainPayload] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [domainType, setDomainType] = useState<string | null>(null);
  const [pendingTime, setPendingTime] = useState<"none" | "24hours" | "72hours" | "upon_approval">("24hours");

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
      setError("Please key in a domain title of at least 3 characters.");
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
        body: JSON.stringify({ domainTitle: title }),
      });

      if (!response.ok) {
        throw new Error("Unable to contact AI validation server.");
      }

      const data = await response.json();
      if (!data.isValid) {
        setError(data.reason || "Linguistic constraints violated. Suffix must be: Persons/Cultures, Places/locations, plural Things/Objects, or Verbs/Actions ending in -ing.");
        setIsValidated(false);
      } else {
        setIsValidated(true);
        setDomainType(data.domainType || "Miscellaneous");
        setAiAnalysis(`Linguistic audit passed: Classified as "${data.domainType}". Safe for public coronation.`);
      }
    } catch (err: any) {
      console.error(err);
      setError("An unexpected validation failure occurred. Please try again.");
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
          pendingTime
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
      };

      onSuccess(newCampaign);
    } catch (err: any) {
      console.error("Create campaign error:", err);
      setError(err.message || "Failed to crown the new campaign in the ledger. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
                Found a New Sovereign Campaign
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
          <div className="p-4 rounded-xl bg-slate-300/40 dark:bg-slate-800/40 border border-slate-400 dark:border-slate-500 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
              👑 Royal Ledger Grammar Laws:
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Must strictly belong to one of four domain categories:</li>
              <li><span className="font-semibold text-slate-700 dark:text-slate-300">Persons (Cultures)</span>: Groups or professions (e.g. "developers", "Vikings") but NOT individual proper names (e.g. "Sarah", "Mike").</li>
              <li><span className="font-semibold text-slate-700 dark:text-slate-300">Places (locations)</span>: Real-world, geographic locations verified by AI.</li>
              <li><span className="font-semibold text-slate-700 dark:text-slate-300">Thing (Objects)</span>: Plural standard collection nouns (e.g. "keyboards", "kittens").</li>
              <li><span className="font-semibold text-slate-700 dark:text-slate-300">Verbs (Actions)</span>: Action nouns ending in <span className="font-semibold text-slate-700 dark:text-slate-300">"-ing"</span> (e.g. "coding", "singing").</li>
            </ul>
          </div>

          {/* Selection of prefix */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Choose Royal Title Prefix
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPrefix("King of");
                  setIsValidated(false);
                }}
                className={`py-3 px-4 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  prefix === "King of"
                    ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/10"
                    : "bg-slate-200/60 dark:bg-slate-900/45 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300/40"
                }`}
              >
                🤴 King of
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrefix("Queen of");
                  setIsValidated(false);
                }}
                className={`py-3 px-4 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  prefix === "Queen of"
                    ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/10"
                    : "bg-slate-200/60 dark:bg-slate-900/45 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300/40"
                }`}
              >
                👸 Queen of
              </button>
            </div>
          </div>

          {/* Domain text payload */}
          <div className="space-y-2 col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor="domainName" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Enter Domain
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 select-none">
                {prefix}...
              </span>
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
                className="w-full pl-[5.5rem] pr-4 py-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-semibold text-slate-800"
              />
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Example: <span className="font-semibold text-slate-600">{prefix} {domainPayload || currentExample.text}</span>
            </p>
          </div>

          {/* Pending Validation Time selection */}
          <div className="space-y-2 col-span-2">
            <label htmlFor="pendingTimeSetting" className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Pending Validation Period
            </label>
            <select
              id="pendingTimeSetting"
              value={pendingTime}
              onChange={(e) => setPendingTime(e.target.value as any)}
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-semibold text-slate-800"
            >
              <option value="none">None (Instant Access)</option>
              <option value="24hours">24 Hours Pending Period</option>
              <option value="72hours">72 Hours Pending Period</option>
              <option value="upon_approval">Leader Manual Approval Only</option>
            </select>
            <p className="text-[10px] text-slate-400 font-mono">
              Controls the escrow period before a newly joined contestant can be voted on.
            </p>
          </div>

          {/* Error and validation reporting */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-2.5 text-rose-700 text-xs"
              >
                <ShieldAlert className="w-4.5 h-4.5 shrink-0 text-rose-500" />
                <span>{error}</span>
              </motion.div>
            )}

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
                {isLoading ? "Auditing Grammar..." : "Run AI Grammar Audit"}
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
}
