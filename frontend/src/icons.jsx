import { createElement } from "react";

function icon(...shapes) {
  return function Icon({ size = 24, strokeWidth = 2, ...props }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {shapes.map(([kind, attributes], index) =>
          createElement(kind, { ...attributes, key: index }),
        )}
      </svg>
    );
  };
}

const path = (d) => ["path", { d }];
const circle = (cx, cy, r) => ["circle", { cx, cy, r }];
const rect = (x, y, width, height, rx = 0) => [
  "rect",
  { x, y, width, height, rx },
];
const line = (x1, y1, x2, y2) => ["line", { x1, y1, x2, y2 }];

export const ArrowRight = icon(path("M5 12h14m-7-7 7 7-7 7"));
export const ArrowUpRight = icon(path("M7 17 17 7M7 7h10v10"));
export const ArrowDownRight = icon(path("M7 7 17 17M17 7v10H7"));
export const BarChart3 = icon(path("M3 3v18h18M8 16v-5m5 5V6m5 10v-3"));
export const Bell = icon(
  path("M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"),
  path("M10 21h4"),
);
export const Building2 = icon(
  rect(3, 3, 12, 18, 2),
  path("M15 9h6v12H3m5-14h2m-2 4h2m-2 4h2m8-2h1M8 21v-3h3v3"),
);
export const CalendarDays = icon(
  rect(3, 5, 18, 16, 2),
  path("M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2"),
);
export const Check = icon(path("m4 12 5 5L20 6"));
export const CheckCircle2 = icon(circle(12, 12, 9), path("m8 12 3 3 5-6"));
export const ChevronDown = icon(path("m6 9 6 6 6-6"));
export const CircleAlert = icon(circle(12, 12, 9), path("M12 8v5m0 3h.01"));
export const Clock3 = icon(circle(12, 12, 9), path("M12 7v5l3 2"));
export const Compass = icon(
  circle(12, 12, 9),
  path("m15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7z"),
);
export const Filter = icon(path("M4 5h16l-6 7v6l-4 2v-8z"));
export const FlaskConical = icon(
  path(
    "M9 3h6m-5 0v6l-6 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-6-9V3M7 15h10",
  ),
);
export const LayoutDashboard = icon(
  rect(3, 3, 8, 8, 1),
  rect(14, 3, 7, 5, 1),
  rect(14, 11, 7, 10, 1),
  rect(3, 14, 8, 7, 1),
);
export const Lightbulb = icon(
  path("M9 18h6m-5 3h4M9 15a7 7 0 1 1 6 0l-1 3h-4z"),
);
export const MapPin = icon(
  path("M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"),
  circle(12, 10, 2.5),
);
export const Menu = icon(path("M4 7h16M4 12h16M4 17h16"));
export const MonitorPlay = icon(
  rect(3, 4, 18, 14, 2),
  path("m10 8 5 3-5 3zM8 21h8m-4-3v3"),
);
export const MoreHorizontal = icon(
  circle(5, 12, 1),
  circle(12, 12, 1),
  circle(19, 12, 1),
);
export const Pencil = icon(
  path(
    "m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5M15 5.5l1.5-1.5a2 2 0 0 1 3 3L18 8.5",
  ),
);
export const Plus = icon(path("M12 5v14M5 12h14"));
export const Search = icon(circle(11, 11, 7), path("m16 16 5 5"));
export const Star = icon(path("m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z"));
export const Send = icon(path("m22 2-7 20-4-9-9-4zM22 2 11 13"));
export const ShieldCheck = icon(
  path("M12 2 4 5v6c0 5 3 9 8 11 5-2 8-6 8-11V5z"),
  path("m9 12 2 2 4-4"),
);
export const SlidersHorizontal = icon(
  line(4, 7, 20, 7),
  line(4, 17, 20, 17),
  circle(9, 7, 2),
  circle(15, 17, 2),
);
export const Sparkles = icon(
  path(
    "m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 1.3L21 19l-1.3.7L19 21l-.7-1.3L17 19l1.3-.7z",
  ),
);
export const Trash2 = icon(
  path("M4 7h16m-10-3h4m-8 3 1 14h10l1-14m-8 4v6m4-6v6"),
);
export const Users = icon(
  circle(9, 8, 3),
  path("M3 20v-2a6 6 0 0 1 12 0v2H3zM17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5h-3"),
);
export const WandSparkles = icon(
  path(
    "m4 20 11-11 3 3L7 23zM14 3l.8 2.2L17 6l-2.2.8L14 9l-.8-2.2L11 6l2.2-.8zM20 15l.5 1.5L22 17l-1.5.5L20 19l-.5-1.5L18 17l1.5-.5z",
  ),
);
export const X = icon(path("M5 5 19 19M19 5 5 19"));
