/** Decorative doodles for the More page — colored-pencil look (soft fills + ink strokes). */

function PencilFilter ({ id }: { id: string }) {
  return (
    <defs>
      <filter id={id} x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.35" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  )
}

export function DoodleVisits () {
  const f = 'more-pencil-visits'
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <PencilFilter id={f} />
      <g filter={`url(#${f})`} strokeLinecap="round" strokeLinejoin="round">
        <rect x="22" y="36" width="84" height="76" rx="10" fill="#e6f7ed" stroke="#2f8f5f" strokeWidth="2.4" />
        <path d="M22 58h84" fill="none" stroke="#5ec99a" strokeWidth="2.2" opacity="0.9" />
        <circle cx="40" cy="46" r="4" fill="#f9a8d4" stroke="#e879a9" strokeWidth="1.6" />
        <circle cx="58" cy="46" r="4" fill="#fde68a" stroke="#f59e0b" strokeWidth="1.6" />
        <circle cx="76" cy="46" r="4" fill="#c4b5fd" stroke="#8b5cf6" strokeWidth="1.6" />
        <path d="M46 82c4-6 10-6 14 0s10 6 14 0" fill="none" stroke="#22a36b" strokeWidth="2.6" />
        <path d="M50 78l8 8 16-16" fill="none" stroke="#16a34a" strokeWidth="3" />
        <rect x="34" y="24" width="12" height="14" rx="2" fill="#a7f3d0" stroke="#059669" strokeWidth="1.8" />
        <rect x="82" y="24" width="12" height="14" rx="2" fill="#a7f3d0" stroke="#059669" strokeWidth="1.8" />
      </g>
    </svg>
  )
}

export function DoodleQuestions () {
  const f = 'more-pencil-questions'
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <PencilFilter id={f} />
      <g filter={`url(#${f})`} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M30 48c2-18 18-28 36-28s34 10 36 28v22c0 14-12 22-28 22h-8l-12 14v-16c-12-4-20-14-22-28z"
          fill="#dbeafe"
          stroke="#2563eb"
          strokeWidth="2.5"
        />
        <path
          d="M58 44q0-10 12-10t12 10q0 8-8 12-4 2-4 8"
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="3.2"
        />
        <circle cx="66" cy="86" r="4.5" fill="#1d4ed8" stroke="#1e40af" strokeWidth="1.2" />
        <path d="M44 36c8-6 20-8 32-6" fill="none" stroke="#93c5fd" strokeWidth="2" opacity="0.85" />
      </g>
    </svg>
  )
}

export function DoodleCharts () {
  const f = 'more-pencil-charts'
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <PencilFilter id={f} />
      <g filter={`url(#${f})`} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 98h84" fill="none" stroke="#a78bfa" strokeWidth="2.6" />
        <rect x="26" y="58" width="22" height="40" rx="5" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2.2" />
        <rect x="53" y="42" width="22" height="56" rx="5" fill="#ddd6fe" stroke="#6d28d9" strokeWidth="2.2" />
        <rect x="80" y="50" width="22" height="48" rx="5" fill="#e9d5ff" stroke="#7c3aed" strokeWidth="2.2" />
        <path d="M26 36c10-4 22 2 32-6s20 4 30-2 18 2 24-6" fill="none" stroke="#c084fc" strokeWidth="2.8" />
        <circle cx="26" cy="36" r="3.5" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.2" />
        <circle cx="58" cy="30" r="3.5" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.2" />
        <circle cx="88" cy="28" r="3.5" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.2" />
        <circle cx="110" cy="34" r="3.5" fill="#f9a8d4" stroke="#db2777" strokeWidth="1.2" />
      </g>
    </svg>
  )
}

export function DoodleDiagnoses () {
  const f = 'more-pencil-dx'
  return (
    <svg className="scrap-more-doodle-art" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <PencilFilter id={f} />
      <g filter={`url(#${f})`} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M64 28c-18 0-32 14-32 32 0 24 32 44 32 44s32-20 32-44c0-18-14-32-32-32z"
          fill="#ffe4e8"
          stroke="#e11d48"
          strokeWidth="2.6"
        />
        <path d="M64 48v24M52 60h24" fill="none" stroke="#be123c" strokeWidth="3.2" />
        <path
          d="M38 88c6 8 16 12 26 12s20-4 26-12"
          fill="none"
          stroke="#fb7185"
          strokeWidth="2"
          opacity="0.85"
        />
        <circle cx="48" cy="52" r="5" fill="#fecdd3" stroke="#f43f5e" strokeWidth="1.6" />
        <circle cx="80" cy="52" r="5" fill="#fecdd3" stroke="#f43f5e" strokeWidth="1.6" />
      </g>
    </svg>
  )
}
