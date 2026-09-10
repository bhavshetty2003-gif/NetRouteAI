type IconProps = {
  className?: string;
};

export function RouterIcon({ className = "" }: IconProps) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      className={className}
    >
      <defs>
        <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58c9ff" />
          <stop offset="100%" stopColor="#1e9be8" />
        </linearGradient>

        <linearGradient id="side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1876ba" />
          <stop offset="100%" stopColor="#0b4f82" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse
        cx="32"
        cy="50"
        rx="18"
        ry="2.5"
        fill="#000"
        opacity="0.12"
      />

      {/* Thin side */}
      <path
        d="
          M14 28
          L14 33
          C14 37 22 40 32 40
          C42 40 50 37 50 33
          L50 28
          Z
        "
        fill="url(#side)"
      />

      {/* Bottom */}
      <ellipse
        cx="32"
        cy="33"
        rx="18"
        ry="5"
        fill="#0d5b91"
      />

      {/* Top */}
      <ellipse
        cx="32"
        cy="28"
        rx="18"
        ry="5"
        fill="url(#top)"
        stroke="white"
        strokeWidth="1.2"
      />

      {/* Gloss */}
      <ellipse
        cx="27"
        cy="26.5"
        rx="5"
        ry="1"
        fill="white"
        opacity="0.35"
      />

      {/* Cisco arrows */}
      <g
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M24 28 H40" />
        <polyline points="37,25 40,28 37,31" />
        <polyline points="27,25 24,28 27,31" />

        <path d="M32 22 V34" />
        <polyline points="29,25 32,22 35,25" />
        <polyline points="29,31 32,34 35,31" />
      </g>

      {/* Front ports */}
      {[20, 24, 28, 32, 36, 40].map((x) => (
        <rect
          key={x}
          x={x}
          y="31"
          width="1.6"
          height="2.2"
          rx="0.3"
          fill="#111827"
        />
      ))}

      {/* LEDs */}
      {[24, 28, 32, 36].map((x) => (
        <circle
          key={x}
          cx={x}
          cy="36"
          r="0.5"
          fill="#22c55e"
        />
      ))}
    </svg>
  );
}

export function SwitchIcon({ className = "" }: IconProps) {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 64 64"
      className={className}
    >
      <rect
        x="8"
        y="18"
        width="48"
        height="28"
        rx="5"
        fill="#334155"
        stroke="#94a3b8"
        strokeWidth="2"
      />

      {[14, 20, 26, 32, 38, 44, 50].map((x) => (
        <rect
          key={x}
          x={x}
          y="28"
          width="4"
          height="6"
          rx="1"
          fill="#111827"
        />
      ))}

      {[15, 21, 27, 33, 39, 45, 51].map((x) => (
        <circle
          key={x}
          cx={x}
          cy="24"
          r="1"
          fill="#22c55e"
        />
      ))}
    </svg>
  );
}

export function PCIcon({ className = "" }: IconProps) {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 64 64"
      className={className}
    >
      <rect
        x="12"
        y="10"
        width="40"
        height="26"
        rx="3"
        fill="#0f172a"
        stroke="#94a3b8"
        strokeWidth="2"
      />

      <rect
        x="15"
        y="13"
        width="34"
        height="20"
        rx="2"
        fill="#38bdf8"
      />

      <line
        x1="32"
        y1="36"
        x2="32"
        y2="45"
        stroke="#94a3b8"
        strokeWidth="2"
      />

      <rect
        x="24"
        y="45"
        width="16"
        height="3"
        rx="1.5"
        fill="#94a3b8"
      />
    </svg>
  );
}