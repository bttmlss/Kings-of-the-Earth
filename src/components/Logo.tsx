import React from "react";

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Ocean */}
      <circle cx="32" cy="32" r="30" fill="#2B8CFF" />

      {/* Simple land masses */}
      <path d="M20 36c2-6 10-9 14-9s8 4 10 6c2 2 4 6 2 9s-6 4-10 4-14-2-16-10z" fill="#34D399" />
      <path d="M12 24c3 0 6 1 8 3s-1 6-4 6-6-4-4-9z" fill="#059669" opacity="0.9" />

      {/* Crown on top */}
      <g transform="translate(12,4)">
        <path d="M18 6l3 5 6-4 6 8v6H6V8l6 4 3-5z" fill="#FBBF24" />
        <path d="M9 13l3-3 3 3 3-3 3 3v2H9v-2z" fill="#F59E0B" opacity="0.9" />
        <circle cx="9" cy="10" r="1.2" fill="#fff" opacity="0.9" />
        <circle cx="21" cy="8.5" r="1.2" fill="#fff" opacity="0.9" />
      </g>

      {/* Subtle ring to give depth */}
      <circle cx="32" cy="32" r="30" stroke="#000000" strokeOpacity="0.06" />
    </svg>
  );
}
