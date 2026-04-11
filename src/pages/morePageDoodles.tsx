/** Decorative doodles for the More page — clear icons; labels are in the UI below each doodle. */

export function DoodleVisits () {
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* Wall calendar */}
        <rect x="18" y="26" width="92" height="90" rx="8" fill="#ecfdf5" stroke="#15803d" strokeWidth="2.5" />
        <rect x="18" y="26" width="92" height="28" rx="8" fill="#6ee7b7" stroke="#15803d" strokeWidth="2.5" />
        <path d="M18 48h92" fill="none" stroke="#15803d" strokeWidth="2" />
        <text
          x="64"
          y="46"
          textAnchor="middle"
          fontFamily="Patrick Hand, 'Indie Flower', cursive"
          fontSize="17"
          fontWeight="700"
          fill="#14532d"
        >
          April
        </text>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <text
            key={`w-${i}`}
            x={25 + i * 12}
            y="62"
            textAnchor="middle"
            fontFamily="Patrick Hand, cursive"
            fontSize="9"
            fill="#166534"
          >
            {d}
          </text>
        ))}
        {Array.from({ length: 35 }).map((_, i) => {
          const col = i % 7
          const row = Math.floor(i / 7)
          const x = 23 + col * 12
          const y = 68 + row * 11
          const isAppt = i === 17
          return (
            <rect
              key={`d-${i}`}
              x={x}
              y={y}
              width="10"
              height="9"
              rx="1.5"
              fill={isAppt ? '#34d399' : 'rgba(255,255,255,0.7)'}
              stroke={isAppt ? '#059669' : '#86efac'}
              strokeWidth={isAppt ? 2 : 1}
            />
          )
        })}
        {/* Small person = patient at visit */}
        <circle cx="104" cy="80" r="7" fill="#fef3c7" stroke="#d97706" strokeWidth="1.8" />
        <path d="M97 90c2 5 8 8 14 8s12-3 14-8" fill="none" stroke="#d97706" strokeWidth="2" />
      </g>
    </svg>
  )
}

export function DoodleQuestions () {
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M28 40c0-12 14-20 36-20s36 8 36 20v28c0 10-8 16-20 16H62l-16 18V88c-10-2-18-10-18-20z"
          fill="#dbeafe"
          stroke="#1d4ed8"
          strokeWidth="2.8"
        />
        <text
          x="64"
          y="78"
          textAnchor="middle"
          fontFamily="Patrick Hand, cursive"
          fontSize="50"
          fontWeight="700"
          fill="#1e40af"
        >
          ?
        </text>
        <path d="M40 32c10-6 24-8 38-6" fill="none" stroke="#93c5fd" strokeWidth="2.2" opacity="0.9" />
      </g>
    </svg>
  )
}

export function DoodleCharts () {
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 100h88" fill="none" stroke="#7c3aed" strokeWidth="2.5" />
        <path d="M28 100V44" fill="none" stroke="#a78bfa" strokeWidth="2.2" />
        <rect x="34" y="72" width="16" height="28" rx="3" fill="#e9d5ff" stroke="#6d28d9" strokeWidth="2" />
        <rect x="56" y="56" width="16" height="44" rx="3" fill="#ddd6fe" stroke="#6d28d9" strokeWidth="2" />
        <rect x="78" y="64" width="16" height="36" rx="3" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2" />
        <rect x="100" y="48" width="16" height="52" rx="3" fill="#f3e8ff" stroke="#6d28d9" strokeWidth="2" />
        <path d="M32 52l20 8 22-12 20 6 18-10" fill="none" stroke="#c026d3" strokeWidth="2.8" />
        <circle cx="32" cy="52" r="3.5" fill="#fff" stroke="#a855f7" strokeWidth="1.8" />
        <circle cx="52" cy="60" r="3.5" fill="#fff" stroke="#a855f7" strokeWidth="1.8" />
        <circle cx="74" cy="48" r="3.5" fill="#fff" stroke="#a855f7" strokeWidth="1.8" />
        <circle cx="94" cy="54" r="3.5" fill="#fff" stroke="#a855f7" strokeWidth="1.8" />
        <circle cx="112" cy="44" r="3.5" fill="#fff" stroke="#a855f7" strokeWidth="1.8" />
      </g>
    </svg>
  )
}

export function DoodleDiagnoses () {
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* Clipboard = medical chart / diagnosis list */}
        <rect x="22" y="38" width="84" height="74" rx="6" fill="#fff7ed" stroke="#c2410c" strokeWidth="2.6" />
        <rect x="48" y="28" width="32" height="14" rx="4" fill="#fdba74" stroke="#c2410c" strokeWidth="2" />
        <ellipse cx="64" cy="32" rx="8" ry="4" fill="#fed7aa" stroke="#c2410c" strokeWidth="1.5" />
        <path d="M34 54h60M34 66h52M34 78h58M34 90h44" fill="none" stroke="#78716c" strokeWidth="2.2" />
        {/* Medical cross = health record */}
        <circle cx="92" cy="60" r="14" fill="#dcfce7" stroke="#16a34a" strokeWidth="2" />
        <path d="M92 54v12M86 60h12" fill="none" stroke="#15803d" strokeWidth="2.8" strokeLinecap="square" />
      </g>
    </svg>
  )
}
