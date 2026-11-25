// Line icons for the sidebar's pages (shown when the sidebar is collapsed) and the title bar's back, forward and
// sidebar buttons. 24-unit grid, drawn with the current colour, so they follow the nav's on / off colours.
const P = {
  home: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  create: (
    <>
      <path d="M12 3.5l1.9 5.2 5.6.3-4.4 3.5 1.5 5.4L12 14.8 7.4 17.9l1.5-5.4L4.5 9l5.6-.3z" />
      <path d="M19 15.5v5M16.5 18h5" />
    </>
  ),
  projects: (
    <>
      <path d="M3.5 7V18.5a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-7.5L10 5.5H4.5a1 1 0 0 0-1 1z" />
      <path d="M3.5 11h17" />
    </>
  ),
  library: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" />
    </>
  ),
  edits: (
    <>
      <circle cx="6.5" cy="7" r="2.5" />
      <circle cx="6.5" cy="17" r="2.5" />
      <path d="M8.6 8.4L20 16M8.6 15.6L20 8" />
    </>
  ),
  workflows: (
    <>
      <rect x="3.5" y="4" width="6" height="5" rx="1" />
      <rect x="14.5" y="10" width="6" height="5" rx="1" />
      <rect x="3.5" y="15" width="6" height="5" rx="1" />
      <path d="M9.5 6.5h2.5v6h2.5M9.5 17.5h2.5v-5" />
    </>
  ),
  characters: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5" />
    </>
  ),
  loras: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </>
  ),
  cloud: <path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.85 1.85M7.35 16.65L5.5 18.5M18.5 18.5l-1.85-1.85M7.35 7.35L5.5 5.5" />
    </>
  ),
  audio: <path d="M3 12h2M7 8v8M11 4.5v15M15 7.5v9M19 10v4M21 12h0" />,
  voices: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M9 20.5h6" />
    </>
  ),
  lines: <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM8 10h8M8 13h5" />,
  music: (
    <>
      <path d="M9 17.5V5.5l11-2v12" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="15.5" r="2.5" />
    </>
  ),
  sounds: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  media: (
    <>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1" />
      <path d="M5 8.5v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-10M10 12.5h4" />
    </>
  ),
  visual: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </>
  )
}

export function NavIcon({ id, className = 'nav-icon' }) {
  const d = P[id] || P.home
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {d}
    </svg>
  )
}
