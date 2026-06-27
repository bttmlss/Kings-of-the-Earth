import React, { useState } from "react";
import { signInWithPopup, signInAnonymously, updateProfile } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { Sparkles, ShieldCheck, User } from "lucide-react";
import Logo from "./Logo";
import { motion } from "motion/react";

interface LoginScreenProps {
  onLoginSuccess?: (user: any) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } catch (err: any) {
      console.error("Google Sign-In Error. Falling back or displaying: ", err);
      setError(err.message || "Unable to open Google Login Pop-up (it could be blocked by browser iframe settings). Please use the Instant Guest Pass below!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError("Please enter a name for your guest pass.");
      return;
    }
    if (guestName.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (guestName.trim().length > 25) {
      setError("Name must be under 25 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await signInAnonymously(auth);
      await updateProfile(userCredential.user, {
        displayName: guestName.trim(),
      });
      if (onLoginSuccess) {
        onLoginSuccess(userCredential.user);
      }
    } catch (err: any) {
      console.warn("Anonymous Sign-In Restricted/Failed. Falling back to secure persistent local session:", err);
      
      // Fallback to local session guest player
      const randomId = Math.random().toString(36).substring(2, 11);
      const localUid = `local_${randomId}`;
      const guestUser = {
        uid: localUid,
        displayName: guestName.trim(),
        email: null,
        photoURL: null,
      };
      
      // Set local persistent cache
      localStorage.setItem("local_sovereign_session", JSON.stringify(guestUser));
      
      if (onLoginSuccess) {
        onLoginSuccess(guestUser);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-silver flex flex-col justify-center items-center px-4 py-12 font-sans selection:bg-amber-100 selection:text-amber-900">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md bg-slate-200 dark:bg-slate-700 rounded-3xl p-8 border border-slate-400 dark:border-slate-500 shadow-xl relative overflow-hidden"
      >
        {/* Decorative Royal Corner Glow */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-100/10 rounded-full blur-2xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-slate-500/10 rounded-full blur-2xl opacity-60 pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 mb-4 ring-4 ring-amber-100 animate-bounce">
            <Logo className="w-8 h-8" />
          </div>
          <h1 className="font-display font-black text-3xl tracking-tight text-slate-900 dark:text-white mb-1">
            Kings of the Earth
          </h1>
          <p className="text-[11px] font-bold bg-amber-500/10 text-amber-700 px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">
            🎮 Sovereign Domain Game
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-200 max-w-sm">
            Battle rival claimants, establish absolute 1-of-1 territory domain titles, and harvest real-time continuous coronation votes to rule.
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs leading-relaxed"
          >
            {error}
          </motion.div>
        )}

        <div className="space-y-6 relative z-10">
          {/* Official Login Options */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-xl bg-slate-900 text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-all duration-200 hover:bg-slate-800 disabled:opacity-50 shadow-md shadow-slate-900/10 cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 24 24">
              <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.24.6 4.45 1.58l2.44-2.44C17.3 1.5 14.93 0 12.24 0A11 11 0 001.24 11a11 11 0 0011 11c6 0 10.91-4.39 10.91-11 0-.66-.06-1.32-.17-1.715H12.24z"/>
            </svg>
            Sign in with Google
          </button>
          <div className="text-[10px] text-center text-slate-400 leading-normal px-2 mt-2">
            💡 Run inside an iframe? If Google Popup is blocked, click to <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="text-amber-600 font-semibold underline hover:text-amber-700 bg-amber-50 px-1 rounded">Open in a New Tab</a> or enter with Guest Pass below under 1 second!
          </div>

          {/* Separator */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-slate-100" />
            <span className="px-3 text-xs text-slate-400 uppercase tracking-widest font-semibold">Or pass as Guest</span>
            <div className="flex-grow border-t border-slate-100" />
          </div>

          {/* Anonymous Guest Access */}
          <form onSubmit={handleGuestLogin} className="space-y-4">
            <div>
              <label htmlFor="guest_name" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Choose Your Royal Stage Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="guest_name"
                  type="text"
                  placeholder="e.g. Duke of Developers"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-medium text-slate-900"
                />
              </div>
            </div>

            <button
              id="submit-register"
              type="submit"
              disabled={isLoading || !guestName.trim()}
              className="w-full py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 transition-all duration-200 cursor-pointer shadow-lg shadow-amber-500/15"
            >
              <Sparkles className="w-4 h-4 text-amber-100" />
              Gain Crest & Enter app
            </button>
          </form>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          No installations or downloads required. Enter instantly.
        </div>
      </motion.div>
    </div>
  );
}
