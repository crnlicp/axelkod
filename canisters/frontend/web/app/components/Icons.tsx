// Line icons in the logo's style: 24px grid, 1.75 stroke, square joins, small
// circuit nodes. Decorative by default (aria-hidden); pass `title` to label one.
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="miter"
      strokeLinecap="square"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

const Node = ({ cx, cy }: { cx: number; cy: number }) => (
  <circle cx={cx} cy={cy} r={1.6} fill="currentColor" stroke="none" />
);

/** Vehicle parts: gear with a hexagon nut. */
export const IconParts = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.2,9.5 L21.8,9.9 L21.8,14.1 L19.2,14.5 L18.8,15.3 L20.4,17.4 L17.4,20.4 L15.3,18.8 L14.5,19.2 L14.1,21.8 L9.9,21.8 L9.5,19.2 L8.7,18.8 L6.6,20.4 L3.6,17.4 L5.2,15.3 L4.8,14.5 L2.2,14.1 L2.2,9.9 L4.8,9.5 L5.2,8.7 L3.6,6.6 L6.6,3.6 L8.7,5.2 L9.5,4.8 L9.9,2.2 L14.1,2.2 L14.5,4.8 L15.3,5.2 L17.4,3.6 L20.4,6.6 L18.8,8.7Z" />
    <path d="M12,8.5 L15,10.25 V13.75 L12,15.5 L9,13.75 V10.25Z" />
  </Icon>
);

/** Software: code brackets with a circuit trace. */
export const IconCode = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8,6 L2.5,11 L8,16" />
    <path d="M16,6 L21.5,11 L16,16" />
    <path d="M13.5,4 L10.5,18" />
    <path d="M12,21 H19" />
    <Node cx={19} cy={21} />
  </Icon>
);

/** Cyber security: shield with a keyhole. */
export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12,2.5 C9.5,4.2 6.8,5 4,5.2 V11.5 C4,16.2 7.2,19.7 12,21.5 C16.8,19.7 20,16.2 20,11.5 V5.2 C17.2,5 14.5,4.2 12,2.5Z" />
    <circle cx={12} cy={10.5} r={2} />
    <path d="M12,12.5 V15.5" />
  </Icon>
);

/** Personal contact. */
export const IconPerson = (p: IconProps) => (
  <Icon {...p}>
    <circle cx={12} cy={8} r={4} />
    <path d="M4,21 C4,16.6 7.6,14 12,14 C16.4,14 20,16.6 20,21" />
  </Icon>
);

/** Swedish company: building with a flag. */
export const IconCompany = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3,21 H21" />
    <path d="M5,21 V10 H13 V21" />
    <path d="M13,21 V13 H19 V21" />
    <path d="M8,13 H10 M8,16.5 H10" />
    <path d="M9,10 V3 H14.5 L13.5,4.75 L14.5,6.5 H9" />
  </Icon>
);

/** Secure by design: padlock with a circuit node. */
export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7,10 V7 C7,4.2 9.2,2.5 12,2.5 C14.8,2.5 17,4.2 17,7 V10" />
    <path d="M4.5,10 H19.5 V21 H4.5Z" />
    <path d="M12,14 V17" />
    <Node cx={12} cy={14} />
  </Icon>
);

/** Quick response: clock. */
export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx={12} cy={12} r={9} />
    <path d="M12,6.5 V12 L15.5,14" />
  </Icon>
);

export const IconMail = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3,5.5 H21 V18.5 H3Z" />
    <path d="M3,5.5 L12,13 L21,5.5" />
  </Icon>
);

export const IconPhone = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5,2.5 H16.5 V21.5 H7.5Z" />
    <path d="M10.5,18.5 H13.5" />
  </Icon>
);

export const IconPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12,21.5 C12,21.5 5,14.8 5,9.5 C5,5.6 8.1,2.5 12,2.5 C15.9,2.5 19,5.6 19,9.5 C19,14.8 12,21.5 12,21.5Z" />
    <circle cx={12} cy={9.5} r={2.5} />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4,12 H19" />
    <path d="M13.5,6.5 L19,12 L13.5,17.5" />
  </Icon>
);

/** Haulage & logistics: truck. */
export const IconTruck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5,6 H14 V16 H2.5Z" />
    <path d="M14,9.5 H18 L21.5,13 V16 H14" />
    <circle cx={6.5} cy={17.5} r={1.8} />
    <circle cx={17.5} cy={17.5} r={1.8} />
  </Icon>
);

/** Workshops: wrench. */
export const IconWrench = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5,3.5 A5,5 0 0 0 9.8,10.3 L3.5,16.6 L7.4,20.5 L13.7,14.2 A5,5 0 0 0 20.5,9.5 L17.5,12.5 L14.5,12.5 L11.5,9.5 L11.5,6.5Z" />
  </Icon>
);

/** Small and medium businesses: shopfront. */
export const IconStore = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3,9 L5,3.5 H19 L21,9" />
    <path d="M3,9 H21 C21,10.7 19.7,12 18,12 C16.3,12 15,10.7 15,9 C15,10.7 13.7,12 12,12 C10.3,12 9,10.7 9,9 C9,10.7 7.7,12 6,12 C4.3,12 3,10.7 3,9Z" />
    <path d="M4.5,12 V20.5 H19.5 V12" />
    <path d="M10,20.5 V15.5 H14 V20.5" />
  </Icon>
);

/** Industry & manufacturing: factory. */
export const IconFactory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5,20.5 V10 L8,13 V10 L13.5,13 V4 H17.5 V20.5Z" />
    <path d="M17.5,20.5 H21.5 V8 H17.5" />
    <path d="M6,17 H8 M10.5,17 H12.5" />
  </Icon>
);

/** Copy to clipboard: two overlapping sheets. */
export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16,8 V6 A2,2 0 0 0 14,4 H6 A2,2 0 0 0 4,6 V14 A2,2 0 0 0 6,16 H8" />
  </Icon>
);

/** Done: check mark. */
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5,12.5 L10,17.5 L19,7" />
  </Icon>
);

/** Admin: newspaper. */
export const IconNews = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="14" height="15" rx="1.5" />
    <path d="M17.5,8.5 H20.5 V17.5 A2,2 0 0 1 18.5,19.5 H5.5" />
    <path d="M7,8.5 H14 M7,12 H14 M7,15.5 H11" />
  </Icon>
);

/** Admin: magnifier (SEO). */
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15,15 L20,20" />
  </Icon>
);

/** Admin: sliders (settings). */
export const IconSliders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4,7 H20 M4,17 H20" />
    <circle cx="9" cy="7" r="2.2" />
    <circle cx="15" cy="17" r="2.2" />
  </Icon>
);

/** Admin: sign out. */
export const IconLogout = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14,4.5 H6.5 A1.5,1.5 0 0 0 5,6 V18 A1.5,1.5 0 0 0 6.5,19.5 H14" />
    <path d="M10,12 H20 M16.5,8.5 L20,12 L16.5,15.5" />
  </Icon>
);

/** Menu: three lines. */
export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4,7 H20 M4,12 H20 M4,17 H20" />
  </Icon>
);

/** Admin: home page. */
export const IconHome = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5,11 L12,3.5 L20.5,11" />
    <path d="M5.5,9.5 V20.5 H18.5 V9.5" />
    <path d="M10,20.5 V14.5 H14 V20.5" />
  </Icon>
);

/** Ekonomi: overview (bars). */
export const IconChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5,20.5 H20.5" />
    <path d="M6.5,17 V12 M11,17 V7 M15.5,17 V10 M20,17 V5" />
  </Icon>
);

/** Ekonomi: ledger (book with lines). */
export const IconLedger = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5,3.5 H18.5 V20.5 H5 Z" />
    <path d="M8.5,3.5 V20.5 M11.5,8 H16 M11.5,12 H16 M11.5,16 H14" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12,5 V19 M5,12 H19" />
  </Icon>
);

export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6,16.5 V11 A6,6 0 0 1 18,11 V16.5 L19.5,18 H4.5 Z" />
    <path d="M10,20.5 H14" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12,4 V15 M7.5,10.5 L12,15 L16.5,10.5" />
    <path d="M4.5,19.5 H19.5" />
  </Icon>
);

export const IconPaperclip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.5,7 L8.5,14 A2,2 0 0 0 11.3,16.8 L18.3,9.8 A4,4 0 0 0 12.7,4.2 L5.7,11.2 A6,6 0 0 0 14.2,19.7 L19.5,14.4" />
  </Icon>
);

/** Ekonomi: sales (invoice with a total line). */
export const IconBank = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5,9.5 L12,4 L20.5,9.5 Z" />
    <path d="M6,10.5 V17 M10,10.5 V17 M14,10.5 V17 M18,10.5 V17 M3.5,20 H20.5" />
  </Icon>
);

export const IconPeople = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5,19 C3.5,15.5 6,13.5 9,13.5 C12,13.5 14.5,15.5 14.5,19" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M15.5,13.6 C18.3,13.4 20.5,15.3 20.5,18.5" />
  </Icon>
);

export const IconPercent = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18.5,5.5 L5.5,18.5" />
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
  </Icon>
);

export const IconInvoice = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6,3.5 H15 L18.5,7 V20.5 H6 Z" />
    <path d="M9,10 H15.5 M9,13.5 H15.5 M12,17 H15.5" />
  </Icon>
);
