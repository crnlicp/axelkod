export type Quality = "high" | "medium" | "low";

export interface QualitySettings {
  dpr: number;
  arcs: number;
  glyphs: number;
  stars: number;
  bloom: boolean;
  antialias: boolean;
  landStride: number; // use every Nth land point
}

export const QUALITY: Record<Quality, QualitySettings> = {
  high: { dpr: 1.75, arcs: 22, glyphs: 220, stars: 1400, bloom: true, antialias: true, landStride: 1 },
  medium: { dpr: 1.5, arcs: 14, glyphs: 150, stars: 900, bloom: true, antialias: false, landStride: 1 },
  low: { dpr: 1.25, arcs: 7, glyphs: 90, stars: 500, bloom: false, antialias: false, landStride: 2 },
};

/** Cheap device-tier heuristic, decided before the first frame. */
export function detectQuality(): Quality {
  if (typeof window === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    // Browsers now expose the real renderer here; the old debug extension is deprecated.
    gpu = gl ? String(gl.getParameter(gl.RENDERER)).toLowerCase() : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // No renderer string: fall through to the CPU/memory heuristic.
  }
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return "low";
  if (cores <= 4 || mem <= 3 || (small && cores <= 6)) return small ? "low" : "medium";
  if (small) return "low";
  return "high";
}
