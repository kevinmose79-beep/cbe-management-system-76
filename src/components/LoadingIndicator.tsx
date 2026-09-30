import React from 'react';

export interface LoadingIndicatorProps {
  className?: string;
  minHeight?: string;
  label?: string;
  message?: string;
  showText?: boolean;
}

/**
 * Reusable Workflow Loading Indicator
 * Soft pulse / ripple-water animation with uppercase PLEASE WAIT status.
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  className = '',
  minHeight = 'min-h-[220px]',
  label,
  message,
  showText = true,
}) => {
  const displayText = label || message || 'PLEASE WAIT';

  return (
    <div
      className={`w-full flex flex-col items-center justify-center p-6 ${minHeight} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={displayText}
    >
      {/* Soft Ripple-Water Visual Indicator */}
      <div className="relative w-14 h-14 flex items-center justify-center mb-3">
        {/* Expanding Water Ripple Rings */}
        <div className="absolute inset-0 rounded-full border-2 border-[#176B45]/60 dark:border-emerald-400/60 animate-ripple-1 pointer-events-none" />
        <div className="absolute inset-0 rounded-full border-2 border-[#176B45]/40 dark:border-emerald-400/40 animate-ripple-2 pointer-events-none" />
        <div className="absolute inset-0 rounded-full border border-[#176B45]/25 dark:border-emerald-400/25 animate-ripple-3 pointer-events-none" />

        {/* Central Core Pulsing Element */}
        <div className="w-3 h-3 rounded-full bg-[#176B45] dark:bg-emerald-400 shadow-sm shadow-[#176B45]/30 z-10 motion-safe:animate-pulse" />
      </div>

      {/* Status Text */}
      {showText && (
        <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase select-none text-center max-w-xs animate-fade-in">
          {displayText}
        </span>
      )}
    </div>
  );
};

export default LoadingIndicator;
