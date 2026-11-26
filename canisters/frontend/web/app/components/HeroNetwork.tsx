// Animated circuit network for the hero: hexagon nodes joined by traces, with
// light pulses travelling along them (echoing the logo). Canvas, decorative only.
// Pauses off-screen and in hidden tabs; draws one still frame for reduced motion.
import { useEffect, useRef } from "react";

type Node = { x: number; y: number; r: number; phase: number };
type Edge = { a: number; b: number };
type Pulse = { edge: number; t: number; speed: number };

// Deterministic layout so every visit (and the prerender) looks the same.
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function build(width: number, height: number) {
  const rand = rng(42);
  const nodes: Node[] = [];
  const cols = Math.max(5, Math.round(width / 150));
  const rows = Math.max(4, Math.round(height / 140));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (rand() < 0.35) continue;
      nodes.push({
        x: ((i + 0.5 + (rand() - 0.5) * 0.7) / cols) * width,
        y: ((j + 0.5 + (rand() - 0.5) * 0.7) / rows) * height,
        r: 3 + rand() * 4,
        phase: rand() * Math.PI * 2,
      });
    }
  }
  const edges: Edge[] = [];
  const maxD = Math.min(width, height) * 0.32;
  nodes.forEach((n, a) => {
    const near = nodes
      .map((m, b) => ({ b, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((e) => e.b > a && e.d < maxD)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    near.forEach((e) => edges.push({ a, b: e.b }));
  });
  const pulses: Pulse[] = Array.from({ length: Math.min(14, edges.length) }, (_, i) => ({
    edge: Math.floor(rand() * edges.length),
    t: rand(),
    speed: 0.12 + rand() * 0.18 + i * 0.002,
  }));
  return { nodes, edges, pulses };
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Orthogonal-ish trace like the logo: horizontal, then a 45° bend.
function tracePoint(n: Node, m: Node, t: number) {
  const dx = m.x - n.x;
  const dy = m.y - n.y;
  const diag = Math.min(Math.abs(dx), Math.abs(dy));
  const bendX = n.x + Math.sign(dx) * (Math.abs(dx) - diag);
  const p1 = { x: bendX, y: n.y };
  const l1 = Math.abs(bendX - n.x);
  const l2 = Math.hypot(m.x - bendX, m.y - n.y);
  const d = t * (l1 + l2);
  if (d <= l1 || l2 === 0) return { x: n.x + Math.sign(dx) * d, y: n.y };
  const u = (d - l1) / l2;
  return { x: p1.x + (m.x - p1.x) * u, y: p1.y + (m.y - p1.y) * u };
}

export function HeroNetwork({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let graph = build(1, 1);
    let w = 0;
    let h = 0;
    let colors = { line: "", node: "", pulse: "" };
    let raf = 0;
    let running = false;
    let last = 0;
    const mouse = { x: -1e4, y: -1e4 };
    // The pulse glow, rendered once per colour scheme instead of a new gradient per pulse per frame.
    let sprite: HTMLCanvasElement | null = null;
    const makeSprite = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 40;
      const g2 = c.getContext("2d");
      if (!g2) return null;
      const g = g2.createRadialGradient(20, 20, 0, 20, 20, 16);
      g.addColorStop(0, colors.pulse);
      g.addColorStop(1, "transparent");
      g2.fillStyle = g;
      g2.fillRect(0, 0, 40, 40);
      return c;
    };
    // 30 frames a second is smooth for slow drifting pulses and halves the GPU work on 60 Hz
    // screens (more on 120 Hz ones).
    const FRAME_MS = 1000 / 30;
    let lastFrame = 0;

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const light = document.documentElement.getAttribute("data-theme") === "light";
      // Light theme: brand-teal pulses (the dark cyan glow reads as grey there).
      colors = { line: cs.getPropertyValue("--circuit").trim(), node: cs.getPropertyValue("--brand").trim(), pulse: light ? cs.getPropertyValue("--brand").trim() : cs.getPropertyValue("--glow").trim() };
      sprite = makeSprite();
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      graph = build(w, h);
    };

    const draw = (time: number) => {
      if (running && lastFrame && time - lastFrame < FRAME_MS - 1) { raf = requestAnimationFrame(draw); return; }
      lastFrame = time;
      const dt = last ? Math.min((time - last) / 1000, 0.1) : 0;
      last = time;
      ctx.clearRect(0, 0, w, h);
      const { nodes, edges, pulses } = graph;
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.line;
      ctx.globalAlpha = 0.22;
      for (const e of edges) {
        const n = nodes[e.a];
        const m = nodes[e.b];
        const dx = m.x - n.x;
        const dy = m.y - n.y;
        const diag = Math.min(Math.abs(dx), Math.abs(dy));
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(n.x + Math.sign(dx) * (Math.abs(dx) - diag), n.y);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
      }
      for (const n of nodes) {
        const near = Math.max(0, 1 - Math.hypot(mouse.x - n.x, mouse.y - n.y) / 220);
        const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time / 1400 + n.phase);
        ctx.globalAlpha = 0.25 + 0.35 * breathe + 0.4 * near;
        ctx.strokeStyle = colors.node;
        hexPath(ctx, n.x, n.y, n.r + near * 3);
        ctx.stroke();
      }
      if (!reduced) {
        for (const p of pulses) {
          p.t += p.speed * dt;
          if (p.t > 1) { p.t = 0; p.edge = (p.edge * 7 + 3) % edges.length; }
          const e = edges[p.edge];
          if (!e) continue;
          const pt = tracePoint(nodes[e.a], nodes[e.b], p.t);
          ctx.globalAlpha = 0.85;
          if (sprite) ctx.drawImage(sprite, pt.x - 10, pt.y - 10, 20, 20);
        }
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = 0;
      lastFrame = 0;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    readColors();
    resize();
    draw(0);

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()));
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => { resize(); if (!running) draw(0); };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const themeObserver = new MutationObserver(() => { readColors(); if (!running) draw(0); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      stop();
      io.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true" />;
}
