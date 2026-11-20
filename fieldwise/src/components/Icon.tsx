const PATHS = {
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 15h2",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5 10 17 19 7",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  alert: "M12 9v4m0 3.5v.5M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z",
  leaf: "M5 19c0-9 6-14 15-14-1 9-6 14-15 14zm0 0 7-7",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  bug: "M9 7a3 3 0 0 1 6 0M8 9h8v5a4 4 0 0 1-8 0V9zm-4 4h4m8 0h4M5 8l3 2m11-2-3 2M5 19l3-2m11 2-3-2M12 9v9",
  flask: "M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 14h9",
  calendar: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm-1 5h16M8 3v4m8-4v4",
  upload: "M12 16V4m0 0-5 5m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  circle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  pointer: "M5 4l14 6-6 2-2 6L5 4z",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4zm10-14 4 4",
  x: "M6 6l12 12M18 6 6 18",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  satellite: "M13 7 9 3 5 7l4 4m4-4 4 4 4-4-4-4-4 4zm-2 2 4 4m-1 5a5 5 0 0 0-5-5m8 5a8 8 0 0 0-8-8",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  rain: "M7 15a4 4 0 0 1 .5-8A5.5 5.5 0 0 1 18 8a3.5 3.5 0 0 1 0 7H7zm1 3-1 2m5-2-1 2m5-2-1 2",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7",
  play: "M7 5v14l11-7L7 5z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  reset: "M4 4v6h6M20 20v-6h-6M5.6 15A8 8 0 0 0 19 17.5M18.4 9A8 8 0 0 0 5 6.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4.3-4.3",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  board: "M4 4h4v16H4zm6 0h4v10h-4zm6 0h4v13h-4z",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14",
  layers: "M12 3 2 8l10 5 10-5-10-5zm-10 9 10 5 10-5M2 16l10 5 10-5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
