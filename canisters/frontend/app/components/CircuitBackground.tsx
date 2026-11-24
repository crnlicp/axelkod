// Decorative circuit traces with hexagon nodes, echoing the logo. A light pulse
// travels along the traces; it is switched off for prefers-reduced-motion in app.css.

const HEX = "M0,-9 L7.8,-4.5 L7.8,4.5 L0,9 L-7.8,4.5 L-7.8,-4.5Z";

// Traces stay in the outer quarters so nodes never sit behind the hero text.
const traces = [
  "M-20,110 H130 L180,160 V280 L220,320 H290",
  "M-20,210 H70 L110,250 V420 L150,460 H250",
  "M1220,90 H1060 L1010,140 V250 L970,290 H910",
  "M1220,200 H1120 L1080,240 V390 L1040,430 H950",
  "M1220,330 H1150 L1110,370 V520",
];

const hexNodes: Array<[number, number]> = [
  [290, 320], [250, 460], [910, 290], [950, 430], [1110, 520],
];

const dots: Array<[number, number]> = [
  [130, 110], [110, 250], [1060, 90], [1080, 240],
];

export function CircuitBackground({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`circuit-bg pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth={1.5} className="circuit-bg__traces">
        {traces.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="none" strokeWidth={2} className="circuit-bg__pulses">
        {/* Staggered via nth-child in app.css: no inline styles under the CSP. */}
        {traces.map((d) => (
          <path key={d} d={d} pathLength={100} />
        ))}
      </g>
      <g className="circuit-bg__nodes" strokeWidth={1.5}>
        {hexNodes.map(([x, y]) => (
          <path key={`${x},${y}`} d={HEX} transform={`translate(${x} ${y})`} />
        ))}
        {dots.map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r={3.5} />
        ))}
      </g>
    </svg>
  );
}
