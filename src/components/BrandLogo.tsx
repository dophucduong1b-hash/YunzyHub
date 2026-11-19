import React from 'react';

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

/**
 * Official YunzyHub "Hex Hub" brand mark.
 * Adapts cleanly between light mode (#17130F hex + #F3EEE3 Y + #FF6B35 node)
 * and dark mode (#FF6B35 hex + #17130F Y + #F3EEE3 node).
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 28,
  showWordmark = true,
  className = '',
}) => {
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Light theme Hex mark */}
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        aria-hidden="true"
        className="shrink-0 dark:hidden"
      >
        <polygon
          points="100,12 176,56 176,144 100,188 24,144 24,56"
          fill="#17130F"
          stroke="#17130F"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <g stroke="#F3EEE3" strokeWidth="15" strokeLinecap="round">
          <line x1="100" y1="104" x2="68" y2="68" />
          <line x1="100" y1="104" x2="132" y2="68" />
          <line x1="100" y1="104" x2="100" y2="148" />
        </g>
        <circle cx="100" cy="104" r="13" fill="#FF6B35" />
      </svg>

      {/* Dark theme Hex mark */}
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        aria-hidden="true"
        className="shrink-0 hidden dark:block"
      >
        <polygon
          points="100,12 176,56 176,144 100,188 24,144 24,56"
          fill="#FF6B35"
          stroke="#FF6B35"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <g stroke="#17130F" strokeWidth="15" strokeLinecap="round">
          <line x1="100" y1="104" x2="68" y2="68" />
          <line x1="100" y1="104" x2="132" y2="68" />
          <line x1="100" y1="104" x2="100" y2="148" />
        </g>
        <circle cx="100" cy="104" r="13" fill="#F3EEE3" />
      </svg>

      {showWordmark && (
        <span className="text-[16px] font-bold tracking-[-0.03em] leading-none text-[#17130F] dark:text-[#F3EEE3]">
          yunzy<span className="text-[#FF6B35]">hub</span>
        </span>
      )}
    </span>
  );
};
