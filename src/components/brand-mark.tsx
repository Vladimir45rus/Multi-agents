export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true" role="img">
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b1220" />
          <stop offset="1" stopColor="#182741" />
        </linearGradient>
        <linearGradient id="bm-hex" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4fc1ff" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="992" height="992" rx="214" fill="url(#bm-bg)" />
      <rect x="16" y="16" width="992" height="992" rx="214" fill="none" stroke="#2b3a55" strokeWidth="10" />
      <path
        d="M822 512 L667 244 L357 244 L202 512 L357 780 L667 780 Z"
        fill="none"
        stroke="url(#bm-hex)"
        strokeWidth="56"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="202" cy="512" r="34" fill="#4fc1ff" />
      <circle cx="667" cy="244" r="34" fill="#a78bfa" />
      <circle cx="667" cy="780" r="34" fill="#ec4899" />
      <path d="M404 404 L516 512 L404 620" fill="none" stroke="#f8fafc" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M566 604 H688" fill="none" stroke="#ec4899" strokeWidth="56" strokeLinecap="round" />
    </svg>
  );
}
