import { ReactNode } from "react";

/**
 * Line-icon set for EduNexus — single stroked geometry, 24px grid, inherits
 * `currentColor`. Server-safe (no hooks) so both server and client components
 * can render them.
 */

type IconProps = { className?: string; strokeWidth?: number };

function Glyph({
  className = "h-5 w-5",
  strokeWidth = 1.7,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IconGrid = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
  </Glyph>
);

export const IconFileText = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Glyph>
);

export const IconSliders = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 7h8M17 7h3M4 17h3M12 17h8" />
    <circle cx="14.5" cy="7" r="2.2" />
    <circle cx="9.5" cy="17" r="2.2" />
  </Glyph>
);

export const IconList = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.4} />
  </Glyph>
);

export const IconUsers = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M16 19v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V19" />
    <circle cx="9.5" cy="7" r="3.2" />
    <path d="M21 19v-1.5a4 4 0 0 0-3-3.9M16.5 4.2a3.2 3.2 0 0 1 0 5.6" />
  </Glyph>
);

export const IconWallet = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M19 8V6.5A1.5 1.5 0 0 0 17.5 5h-11A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V16" />
    <path d="M20 8h-5a2 2 0 0 0 0 4h5z" />
  </Glyph>
);

export const IconCap = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M22 9 12 4 2 9l10 5z" />
    <path d="M6 11.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5" />
    <path d="M22 9v5" />
  </Glyph>
);

export const IconClipboardCheck = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M9 4h6a1 1 0 0 1 1 1v1.5H8V5a1 1 0 0 1 1-1z" />
    <path d="M16 5.5h1.5A1.5 1.5 0 0 1 19 7v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V7a1.5 1.5 0 0 1 1.5-1.5H8" />
    <path d="M9.3 13.6l1.9 1.9 3.5-3.7" />
  </Glyph>
);

export const IconPrinter = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7 9V4h10v5" />
    <path d="M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 18.5 18H17" />
    <rect x="7" y="14" width="10" height="7" rx="1.2" />
  </Glyph>
);

export const IconBook = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M8 7.5h7M8 11.5h5" />
  </Glyph>
);

export const IconBell = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18.5h15z" />
    <path d="M10 21h4" />
  </Glyph>
);

export const IconReceipt = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9.5 8h5M9.5 12h5" />
  </Glyph>
);

export const IconShield = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
    <path d="M9.3 12.2l1.9 1.9 3.5-3.7" />
  </Glyph>
);

export const IconChart = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 4v16h16" />
    <path d="M8 16v-4M12.5 16V8M17 16v-6" />
  </Glyph>
);

export const IconClock = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 1.8" />
  </Glyph>
);

export const IconCalendar = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2.4" />
    <path d="M4 10h16M9 3.5V6.5M15 3.5V6.5" />
  </Glyph>
);

export const IconCheck = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M20 6.5 9.2 17.3 4 12.1" />
  </Glyph>
);

export const IconCheckCircle = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.4 12.4l2.4 2.4 4.8-5.2" />
  </Glyph>
);

export const IconAlert = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M10.3 4.3 2.9 17.4A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3.1L13.7 4.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 10v3.6M12 17h.01" />
  </Glyph>
);

export const IconInfo = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11.2v5M12 7.8h.01" />
  </Glyph>
);

export const IconArrowRight = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Glyph>
);

export const IconChevronRight = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Glyph>
);

export const IconDownload = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 4v11M8 11.5l4 4 4-4M5 19h14" />
  </Glyph>
);

export const IconMenu = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Glyph>
);

export const IconX = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Glyph>
);

export const IconLogout = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M15 4h2.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M11 8l-4 4 4 4M7.5 12H16" />
  </Glyph>
);

export const IconHome = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
    <path d="M9.6 20.5V14h4.8v6.5" />
  </Glyph>
);

export const IconUser = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </Glyph>
);

export const IconSearch = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M19.8 19.8 16 16" />
  </Glyph>
);

export const IconFilter = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 6h16l-6.2 7.2V19l-3.6 1.8v-7.6z" />
  </Glyph>
);

export const IconSparkles = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M11.5 4.5 13 9l4.5 1.5L13 12l-1.5 4.5L10 12 5.5 10.5 10 9z" />
    <path d="M18 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Glyph>
);

export const IconBuilding = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M5 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
    <path d="M15 10h2.5A1.5 1.5 0 0 1 19 11.5V21" />
    <path d="M3 21h18M8.5 8.5h2M8.5 12.5h2M8.5 16.5h2" />
  </Glyph>
);

export const IconLayers = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
    <path d="M4 12.2 12 16.7l8-4.5M4 16.4l8 4.5 8-4.5" />
  </Glyph>
);

export const IconLock = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
  </Glyph>
);

export const IconMail = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M4.5 7.5 12 13l7.5-5.5" />
  </Glyph>
);

export const IconPhone = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
  </Glyph>
);

export const IconPin = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </Glyph>
);

export const IconExternal = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M14 5h5v5M19 5l-7 7" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Glyph>
);

/** Icon registry — lets server components pass an icon *name* to client shells. */
export const ICONS = {
  grid: IconGrid,
  file: IconFileText,
  sliders: IconSliders,
  list: IconList,
  users: IconUsers,
  wallet: IconWallet,
  cap: IconCap,
  clipboard: IconClipboardCheck,
  printer: IconPrinter,
  book: IconBook,
  bell: IconBell,
  receipt: IconReceipt,
  shield: IconShield,
  chart: IconChart,
  clock: IconClock,
  calendar: IconCalendar,
  check: IconCheck,
  checkCircle: IconCheckCircle,
  alert: IconAlert,
  info: IconInfo,
  arrowRight: IconArrowRight,
  chevronRight: IconChevronRight,
  download: IconDownload,
  menu: IconMenu,
  x: IconX,
  logout: IconLogout,
  home: IconHome,
  user: IconUser,
  search: IconSearch,
  filter: IconFilter,
  sparkles: IconSparkles,
  building: IconBuilding,
  layers: IconLayers,
  lock: IconLock,
  mail: IconMail,
  phone: IconPhone,
  pin: IconPin,
  external: IconExternal,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className, strokeWidth }: { name: IconName } & IconProps) {
  const Cmp = ICONS[name];
  return <Cmp className={className} strokeWidth={strokeWidth} />;
}
