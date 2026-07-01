import React, { useState, useEffect } from "react";
import { signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { Crown, Sparkles, ShieldCheck, Phone, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

interface LoginScreenProps {
  onLoginSuccess?: (user: any) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    // Ensure we always have a fresh verifier bound to the current DOM node
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {}
      window.recaptchaVerifier = undefined;
    }

    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible',
      'callback': (response: any) => {
        // reCAPTCHA solved
      }
    });

    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {}
        window.recaptchaVerifier = undefined;
      }
    };
  }, []);

  useEffect(() => {
    let timer: any;
    if (confirmationResult && timeLeft !== null && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (confirmationResult && timeLeft === 0) {
      setConfirmationResult(null);
      setVerificationCode("");
      setTimeLeft(null);
      setError("Verification code expired. Please request a new one.");
    }
    return () => clearInterval(timer);
  }, [confirmationResult, timeLeft]);

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
      setError(err.message || "Unable to open Google Login Pop-up (it could be blocked by browser iframe settings).");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let formattedPhone = phoneNumber.trim().replace(/[^\d+]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.length === 10) {
        formattedPhone = '+1' + formattedPhone;
      } else {
        formattedPhone = '+' + formattedPhone;
      }
    }

    if (!/^\+\d{10,15}$/.test(formattedPhone)) {
      setError("Please enter a valid phone number including country code (e.g. +1234567890).");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setTimeLeft(600); // 10 minutes
    } catch (err: any) {
      console.error("Phone Auth Error Detail:", err);
      if (err.code === "auth/invalid-phone-number") {
         setError("Invalid phone number format. Please ensure it includes the country code (e.g. +1).");
      } else if (err.code === "auth/operation-not-allowed") {
         setError("Phone authentication is not fully enabled in Firebase, or the SMS region is not allowed. Please configure this in the Firebase Console (Auth -> Settings -> SMS Region Policy).");
      } else {
         setError(err.message || "Failed to send verification code.");
      }
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then((widgetId: any) => {
          if (typeof window !== "undefined" && (window as any).grecaptcha) {
            (window as any).grecaptcha.reset(widgetId);
          }
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim() || !confirmationResult) {
      setError("Please enter the verification code.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await confirmationResult.confirm(verificationCode);
      setTimeLeft(null);
      if (onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } catch (err: any) {
      console.error("Code Verification Error:", err);
      setError("Invalid verification code. Please try again.");
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
        <div id="recaptcha-container"></div>
        {/* Decorative Royal Corner Glow */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-100/10 rounded-full blur-2xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-slate-500/10 rounded-full blur-2xl opacity-60 pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 mb-4 ring-4 ring-amber-100 animate-bounce">
            <Crown className="w-8 h-8 text-white stroke-[2]" />
          </div>
          <h1 className="font-display font-black text-3xl tracking-tight text-slate-900 dark:text-white mb-1">
            Kings of the Earth
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-200 max-w-sm mt-4">
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
            💡 Run inside an iframe? If Google Popup is blocked, click to <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="text-amber-600 font-semibold underline hover:text-amber-700 bg-amber-50 px-1 rounded">Open in a New Tab</a> or enter with Phone Auth below!
          </div>

          {/* Separator */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-slate-100" />
            <span className="px-3 text-xs text-slate-400 uppercase tracking-widest font-semibold">Or use Phone Auth</span>
            <div className="flex-grow border-t border-slate-100" />
          </div>

          {/* Phone Auth */}
          {!confirmationResult ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label htmlFor="phone_number" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Enter Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="phone_number"
                    type="tel"
                    placeholder="+1234567890"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-medium text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !phoneNumber.trim()}
                className="w-full py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 transition-all duration-200 cursor-pointer shadow-lg shadow-amber-500/15"
              >
                <Sparkles className="w-4 h-4 text-amber-100" />
                Send Verification Code
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="verification_code" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Verification Code
                  </label>
                  {timeLeft !== null && (
                    <span className="text-[10px] font-bold text-slate-400 font-mono">
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <CheckCircle2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="verification_code"
                    type="text"
                    placeholder="123456"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all font-medium text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !verificationCode.trim()}
                className="w-full py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 transition-all duration-200 cursor-pointer shadow-lg shadow-amber-500/15"
              >
                <Sparkles className="w-4 h-4 text-amber-100" />
                Verify Code
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          No installations or downloads required. Enter instantly.
        </div>
      </motion.div>
    </div>
  );
}
