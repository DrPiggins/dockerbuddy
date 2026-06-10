/**
 * Buddy — a friendly whale-droid mascot. The twist on the Docker whale:
 * rounded, glowing eye, gentle violet aura.
 */
export function Mascot({ size = 80 }: { size?: number }) {
  return (
    <div
      className="relative inline-block animate-[float_6s_ease-in-out_infinite]"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full blur-2xl opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(13,183,237,0.6) 0%, rgba(139,92,246,0.2) 60%, transparent 80%)",
        }}
      />
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="relative"
        aria-hidden
      >
        {/* Body */}
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4fc6ff" />
            <stop offset="60%" stopColor="#0db7ed" />
            <stop offset="100%" stopColor="#0789c2" />
          </linearGradient>
          <radialGradient id="cheekGrad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Belly highlight behind */}
        <ellipse
          cx="50"
          cy="62"
          rx="34"
          ry="26"
          fill="url(#bodyGrad)"
        />

        {/* Side fin */}
        <path
          d="M 18 60 Q 8 64 12 78 Q 22 74 26 68 Z"
          fill="#0789c2"
        />

        {/* Tail */}
        <path
          d="M 82 56 Q 96 48 96 36 Q 92 50 84 52 Q 96 60 96 70 Q 90 60 82 62 Z"
          fill="#0789c2"
        />

        {/* Top container cubes — the "buddy" twist */}
        <rect x="38" y="32" width="10" height="10" rx="2" fill="#162241" stroke="#4fc6ff" strokeWidth="1.2" />
        <rect x="52" y="32" width="10" height="10" rx="2" fill="#162241" stroke="#4fc6ff" strokeWidth="1.2" />
        <rect x="45" y="20" width="10" height="10" rx="2" fill="#162241" stroke="#a78bfa" strokeWidth="1.2" />

        {/* Eye */}
        <circle cx="44" cy="58" r="3.5" fill="white" />
        <circle cx="44.5" cy="58.5" r="2" fill="#070d1c" />
        <circle cx="45.2" cy="57.6" r="0.7" fill="white" />

        <circle cx="58" cy="58" r="3.5" fill="white" />
        <circle cx="58.5" cy="58.5" r="2" fill="#070d1c" />
        <circle cx="59.2" cy="57.6" r="0.7" fill="white" />

        {/* Smile */}
        <path
          d="M 46 72 Q 51 76 56 72"
          stroke="#070d1c"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
