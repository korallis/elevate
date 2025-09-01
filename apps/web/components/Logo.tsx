import React from 'react';

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <div className="relative group">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className="transition-transform duration-300 group-hover:scale-110"
        aria-label="Elev8 Logo"
      >
        <defs>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(252, 100%, 65%)" />
            <stop offset="100%" stopColor="hsl(163, 100%, 39%)" />
          </linearGradient>
          <filter id="logo-glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background with subtle glow */}
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="12"
          fill="url(#logo-gradient)"
          opacity="0.15"
          filter="url(#logo-glow)"
        />

        {/* Main shape */}
        <rect x="0" y="0" width="48" height="48" rx="12" fill="url(#logo-gradient)" />

        {/* Number 8 design for Elev8 */}
        <text
          x="24"
          y="34"
          fontSize="28"
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          opacity="0.95"
        >
          8
        </text>

        {/* Upward arrow for "elevation" */}
        <path d="M24 8 L28 14 L20 14 Z" fill="white" opacity="0.9" />

        {/* Accent dots forming elevator levels */}
        <circle cx="12" cy="36" r="1.5" fill="white" opacity="0.6" />
        <circle cx="12" cy="28" r="1.5" fill="white" opacity="0.7" />
        <circle cx="12" cy="20" r="1.5" fill="white" opacity="0.8" />
        <circle cx="12" cy="12" r="1.5" fill="white" opacity="0.9" />
      </svg>
    </div>
  );
}
