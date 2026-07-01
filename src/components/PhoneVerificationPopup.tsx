import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldAlert } from "lucide-react";

interface PhoneVerificationPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PhoneVerificationPopup({ isOpen, onClose }: PhoneVerificationPopupProps) {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl shadow-xl border border-slate-700 dark:border-slate-300 flex items-center gap-3 w-max max-w-[90vw]"
        >
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-sm tracking-tight text-center">Verify your phone number to vote for this user</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
