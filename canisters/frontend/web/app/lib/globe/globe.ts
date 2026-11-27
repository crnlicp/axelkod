/**
 * The hero globe: a dotted Earth inside a glowing atmosphere, with live
 * "encrypted" network arcs, packets, arrival ripples, orbiting rings of
 * cipher glyphs and a faint lattice shell. Vanilla three.js + GLSL for
 * maximum compatibility (WebGL2), bloom via the post-processing addons.
 * Ported from the cybersecurity site's hero; this copy draws on a transparent
 * canvas (the hero's own background shows through) in the site's theme colours,
 * passed in as `colors` (see `themeColors`). Recreate the scene on a theme change.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CIPHERS, CITIES, type City } from "./cities";
import { QUALITY, type Quality } from "./quality";

const R = 2; // globe radius (world units)
const SEGMENTS = 72; // points per arc

export interface HoverInfo {
  x: number;
  y: number;
  city: City;
  cipher: string;
  latency: number;
}

/** Theme colours as raw (linear) three.js colours; CSS tokens may be oklch(), so a 2D canvas converts them. */
export interface GlobeColors { primary: THREE.Color; secondary: THREE.Color; hi: THREE.Color; base: THREE.Color; star: THREE.Color; light: boolean }

export function themeColors(): GlobeColors {
  const cs = getComputedStyle(document.documentElement);
  const light = document.documentElement.getAttribute("data-theme") === "light";
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const conv = (value: string) => {
    if (!ctx) return new THREE.Color(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
  };
  const token = (name: string) => conv(cs.getPropertyValue(name).trim() || "#000");
  // Light theme: brand teal and navy, with navy highlights (white and cyan glow vanish on white).
  return light
    ? { primary: token("--brand"), secondary: token("--accent"), hi: token("--fg"), base: token("--bg"), star: token("--muted"), light }
    : { primary: token("--glow"), secondary: token("--brand"), hi: conv("#ffffff"), base: token("--bg"), star: token("--muted"), light };
}

export interface GlobeOptions {
  quality: Quality;
  colors: GlobeColors;
  /** Globe diameter as a fraction of the screen height (on portrait, capped by the width). */
  size: number;
  /** Logo image URL drawn at the globe's core (always facing the viewer), plus a beacon on Stockholm. */
  logo?: string;
  /** The logo's height in CSS pixels (matches the logo in its own column). */
  logoHeight?: () => number;
  reducedMotion: boolean;
  onHover?: (info: HoverInfo | null) => void;
  onReady?: () => void;
  /** Called a few times per second with the longitude facing the viewer. */
  onLongitude?: (lon: number, lat: number) => void;
  /** Called when a packet arrives at a node. */
  onArrival?: (city: City) => void;
}

export function latLonToVec3(lat: number, lon: number, r = R, out = new THREE.Vector3()) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const dotsVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uScan;
  uniform vec3 uCenter;
  attribute float aRand;
  attribute float aBoost;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vScan;
  uniform vec3 uCyan;
  uniform vec3 uViolet;
  uniform vec3 uHi;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(world.xyz - uCenter);
    vec3 toCam = normalize(cameraPosition - world.xyz);
    float facing = dot(n, toCam);
    float lat = position.y / ${R.toFixed(1)};
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + aRand * 1.7) + aRand * 47.0);
    float scan = exp(-pow((lat - uScan) * 14.0, 2.0));
    vec4 mv = viewMatrix * world;
    vScan = scan;
    vAlpha = smoothstep(-0.1, 0.45, facing) * (0.35 + 0.65 * twinkle);
    float hue = clamp(0.5 + 0.45 * n.y + 0.25 * sin(aRand * 6.2831 + n.x * 3.0), 0.0, 1.0);
    vColor = mix(uCyan, uViolet, hue * 0.85);
    vColor = mix(vColor, uHi, clamp(aBoost * 0.45 + scan * 0.3, 0.0, 1.0));
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + aBoost * 1.8 + scan * 0.9) * uPixelRatio * (7.0 / -mv.z);
  }
`;

const coastVertex = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uReveal;
  varying float vAlpha;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float facing = dot(normalize(world.xyz - uCenter), normalize(cameraPosition - world.xyz));
    vAlpha = smoothstep(-0.05, 0.35, facing) * 0.22 * uReveal;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const coastFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

const dotsFragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vScan;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor * (1.0 + vScan * 1.2), a * vAlpha);
  }
`;

const coreVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const coreFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform float uReveal;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float f = 1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float rim = pow(f, 3.2);
    vec3 col = uBase + uRim * rim * 0.9 * uReveal;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Translucent front surface over the logo at the core: thin in the middle, denser toward
// the limb (Fresnel), so the logo reads as sitting deep inside the globe.
const glassFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform float uReveal;
  uniform float uMin;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float f = 1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float a = mix(uMin, 1.0, pow(f, 1.6));
    gl_FragColor = vec4(uBase + uRim * pow(f, 3.2) * 0.9 * uReveal, a);
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float d = dot(normalize(vNormal), normalize(vView));
    float glow = pow(clamp(0.74 + d, 0.0, 1.0), 6.0);
    vec3 col = mix(uColorA, uColorB, clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col * glow * uIntensity, glow * uIntensity);
  }
`;

const arcVertex = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const arcFragment = /* glsl */ `
  uniform float uHead;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uHi;
  varying float vT;
  void main() {
    float tailLen = 0.32;
    float comet = smoothstep(uHead - tailLen, uHead, vT) * step(vT, uHead);
    float trail = step(vT, uHead) * 0.12;
    float a = max(comet, trail) * uOpacity;
    if (a < 0.003) discard;
    vec3 col = mix(uColor, uHi, comet * comet * 0.7);
    gl_FragColor = vec4(col, a);
  }
`;

const spriteVertex = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (7.0 / -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;

const spriteFragment = /* glsl */ `
  uniform vec3 uHi;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.45;
    gl_FragColor = vec4(mix(vColor, uHi, core), (core + halo) * vAlpha);
  }
`;

const glyphVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uCenter;
  attribute float aGlyph;
  attribute float aSpeed;
  attribute float aRand;
  varying float vGlyph;
  varying float vAlpha;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 toCam = normalize(cameraPosition - world.xyz);
    float facing = dot(normalize(world.xyz - uCenter), toCam);
    vGlyph = mod(aGlyph + floor(uTime * aSpeed + aRand * 10.0), 16.0);
    float flicker = 0.55 + 0.45 * step(0.35, fract(sin(floor(uTime * 3.0 + aRand * 91.0)) * 43758.5453));
    vAlpha = mix(0.18, 1.0, smoothstep(-0.4, 0.5, facing)) * flicker;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (7.0 / -mv.z);
  }
`;

const glyphFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vGlyph;
  varying float vAlpha;
  void main() {
    vec2 cell = vec2(mod(vGlyph, 4.0), floor(vGlyph / 4.0));
    vec2 uv = (vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) + cell) / 4.0;
    float a = texture2D(uAtlas, uv).r;
    if (a < 0.05) discard;
    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
  }
`;

const latticeVertex = /* glsl */ `
  uniform vec3 uCenter;
  varying float vFacing;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(world.xyz - uCenter), normalize(cameraPosition - world.xyz));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const latticeFragment = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vFacing;
  void main() {
    float a = uOpacity * smoothstep(-0.05, 0.6, vFacing);
    gl_FragColor = vec4(uColor, a);
  }
`;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

interface Arc {
  line: THREE.Line;
  mat: THREE.ShaderMaterial;
  positions: Float32Array;
  from: City;
  to: City;
  start: number;
  duration: number;
  arrived: boolean;
}

interface Ripple {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  start: number;
  active: boolean;
}

export class GlobeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private clock = new THREE.Timer();
  private globe = new THREE.Group(); // rotates with the Earth
  private tilt = new THREE.Group(); // fixed tilt + drag
  private root = new THREE.Group(); // position/scale (layout, scroll)
  private rings = new THREE.Group();
  private stars?: THREE.Points;
  private uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uReveal: { value: 0 },
    uScan: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uHi: { value: new THREE.Color() },
  };
  private c: GlobeColors;
  /** Additive glow on dark; normal blending on light, where additive light vanishes. */
  private blend: THREE.Blending;
  private arcs: Arc[] = [];
  private ripples: Ripple[] = [];
  private packets!: THREE.Points;
  private nodes!: THREE.Points;
  private lattice!: THREE.LineSegments;
  private latticePulse = 0;
  private cityVecs: THREE.Vector3[] = [];
  private raf = 0;
  private running = false;
  private ready = false;
  private wantRunning = false;
  private disposed = false;
  private size = { w: 1, h: 1 };
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private drag = { active: false, lastX: 0, lastY: 0, vy: 0, vx: 0, rotY: 0, rotX: 0 };
  private scroll = 0;
  private baseRotation = 0;
  private lastLonReport = 0;
  private hovered: string | null = null;
  private logo?: THREE.Sprite;
  private beacon: THREE.Mesh[] = [];
  private q;

  constructor(private canvas: HTMLCanvasElement, private opts: GlobeOptions) {
    this.q = QUALITY[opts.quality];
    this.c = opts.colors;
    this.blend = this.c.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.uniforms.uHi.value.copy(this.c.hi);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.root);
    this.root.add(this.tilt);
    this.tilt.add(this.globe);
    this.tilt.rotation.set(0.32, 0, -0.12);
    // Face Scandinavia on load.
    const sto = latLonToVec3(55, 15);
    this.baseRotation = -Math.atan2(sto.x, sto.z) + 0.35;
    this.globe.rotation.y = this.baseRotation;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
  }

  async init(landUrl: string, coastUrl?: string) {
    const [landBuf, coastBuf] = await Promise.all([
      fetch(landUrl).then((r) => r.arrayBuffer()),
      coastUrl ? fetch(coastUrl).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : Promise.resolve(null),
    ]);
    const land = new Int16Array(landBuf);
    if (this.disposed) return;
    this.buildCore();
    this.buildDots(land);
    if (coastBuf) this.buildCoastlines(new Int16Array(coastBuf));
    this.buildGraticule();
    this.buildNodes();
    this.buildArcs();
    this.buildRipples();
    this.buildRings();
    this.buildLattice();
    this.buildStars();
    if (this.opts.logo) {
      await this.buildLogo(this.opts.logo).catch((e: unknown) => console.warn("[globe] logo", e));
      if (this.disposed) return;
      this.buildBeacon();
    }
    this.setupPost();
    this.resize();
    this.ready = true;
    this.opts.onReady?.();
    if (this.opts.reducedMotion) {
      this.uniforms.uReveal.value = 1;
      this.renderOnce();
    } else if (this.wantRunning || !document.hidden) {
      this.start();
    }
  }

  // ---- builders -------------------------------------------------------------

  private buildCore() {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.985, 96, 96),
      new THREE.ShaderMaterial({
        vertexShader: coreVertex,
        fragmentShader: coreFragment,
        uniforms: { uBase: { value: this.c.base.clone() }, uRim: { value: this.c.secondary.clone() }, uReveal: this.uniforms.uReveal },
      }),
    );
    core.renderOrder = 0;
    this.globe.add(core);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.16, 96, 96),
      new THREE.ShaderMaterial({
        vertexShader: coreVertex,
        fragmentShader: atmosphereFragment,
        uniforms: { uColorA: { value: this.c.secondary.clone() }, uColorB: { value: this.c.primary.clone() }, uIntensity: { value: 1.0 } },
        side: THREE.BackSide,
        blending: this.blend,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.root.add(atmosphere); // does not rotate (view-dependent glow)
  }

  private buildDots(land: Int16Array) {
    const stride = this.q.landStride;
    const count = Math.floor(land.length / 2 / stride);
    const pos = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const boost = new Float32Array(count);
    const v = new THREE.Vector3();
    const cityVecs = CITIES.map((c) => latLonToVec3(c.lat, c.lon, R));
    for (let i = 0; i < count; i++) {
      const lat = land[i * 2 * stride] / 100;
      const lon = land[i * 2 * stride + 1] / 100;
      latLonToVec3(lat, lon, R * 1.002, v);
      pos.set([v.x, v.y, v.z], i * 3);
      rand[i] = Math.random();
      // brighter dots near network nodes ("city lights")
      let b = 0;
      for (const c of cityVecs) b = Math.max(b, 1 - Math.min(1, v.distanceTo(c) / 0.28));
      boost[i] = b * b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    g.setAttribute("aBoost", new THREE.BufferAttribute(boost, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: dotsVertex,
      fragmentShader: dotsFragment,
      uniforms: {
        ...this.uniforms,
        uSize: { value: this.opts.quality === "low" ? 3.6 : 3.2 },
        uCyan: { value: this.c.primary.clone() },
        uViolet: { value: this.c.secondary.clone() },
      },
      transparent: true,
      depthWrite: false,
      blending: this.blend,
    });
    const points = new THREE.Points(g, m);
    points.renderOrder = 2;
    this.globe.add(points);
  }

  /** Continent borders: faint lines over the land dots. */
  private buildCoastlines(data: Int16Array) {
    const verts: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let prev: [number, number] | null = null;
    for (let i = 0; i + 1 < data.length; i += 2) {
      if (data[i] === 32767) {
        prev = null;
        continue;
      }
      const cur: [number, number] = [data[i] / 100, data[i + 1] / 100];
      if (prev && Math.abs(cur[1] - prev[1]) < 180) {
        latLonToVec3(prev[0], prev[1], R * 1.003, a);
        latLonToVec3(cur[0], cur[1], R * 1.003, b);
        verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      prev = cur;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const lines = new THREE.LineSegments(
      g,
      new THREE.ShaderMaterial({
        vertexShader: coastVertex,
        fragmentShader: coastFragment,
        uniforms: { ...this.uniforms, uColor: { value: this.c.primary.clone() } },
        transparent: true,
        depthWrite: false,
        blending: this.blend,
      }),
    );
    lines.renderOrder = 2;
    this.globe.add(lines);
  }

  private buildGraticule() {
    const verts: number[] = [];
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    const r = R * 1.001;
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 4) {
        latLonToVec3(lat, lon, r, v);
        latLonToVec3(lat, lon + 4, r, w);
        verts.push(v.x, v.y, v.z, w.x, w.y, w.z);
      }
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -88; lat < 88; lat += 4) {
        latLonToVec3(lat, lon, r, v);
        latLonToVec3(lat + 4, lon, r, w);
        verts.push(v.x, v.y, v.z, w.x, w.y, w.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: this.c.primary, transparent: true, opacity: 0.055, depthWrite: false, blending: this.blend }),
    );
    lines.renderOrder = 1;
    this.globe.add(lines);
  }

  private buildNodes() {
    this.cityVecs = CITIES.map((c) => latLonToVec3(c.lat, c.lon, R * 1.012));
    const n = CITIES.length;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const alpha = new Float32Array(n).fill(1);
    const color = new Float32Array(n * 3);
    CITIES.forEach((c, i) => {
      pos.set(this.cityVecs[i].toArray(), i * 3);
      size[i] = c.hub ? 11 : 7;
      (c.hub ? this.c.hi : this.c.primary).toArray(color, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    this.nodes = new THREE.Points(g, this.spriteMaterial());
    this.nodes.renderOrder = 4;
    this.globe.add(this.nodes);
  }

  private spriteMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: spriteVertex,
      fragmentShader: spriteFragment,
      uniforms: { uPixelRatio: this.uniforms.uPixelRatio, uHi: this.uniforms.uHi },
      transparent: true,
      depthWrite: false,
      blending: this.blend,
    });
  }

  private buildArcs() {
    const n = this.opts.reducedMotion ? 10 : this.q.arcs;
    for (let i = 0; i < n; i++) {
      const positions = new Float32Array((SEGMENTS + 1) * 3);
      const t = new Float32Array(SEGMENTS + 1).map((_, k) => k / SEGMENTS);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      g.setAttribute("aT", new THREE.BufferAttribute(t, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: arcVertex,
        fragmentShader: arcFragment,
        uniforms: { uHead: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: this.c.primary.clone() }, uHi: this.uniforms.uHi },
        transparent: true,
        depthWrite: false,
        blending: this.blend,
      });
      const line = new THREE.Line(g, mat);
      line.frustumCulled = false;
      line.renderOrder = 3;
      this.globe.add(line);
      const arc: Arc = { line, mat, positions, from: CITIES[0], to: CITIES[1], start: 0, duration: 1, arrived: false };
      this.respawnArc(arc, -Math.random() * 2.5);
      this.arcs.push(arc);
    }
    // packet sprites (one per arc)
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n).fill(9), 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    this.packets = new THREE.Points(g, this.spriteMaterial());
    this.packets.frustumCulled = false;
    this.packets.renderOrder = 5;
    this.globe.add(this.packets);
  }

  private respawnArc(arc: Arc, startOffset = 0) {
    const pickCity = () => CITIES[Math.floor(Math.random() * CITIES.length)];
    let from = Math.random() < 0.3 ? CITIES[0] : pickCity();
    let to = pickCity();
    let guard = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    while ((to === from || latLonToVec3(from.lat, from.lon, 1, a).angleTo(latLonToVec3(to.lat, to.lon, 1, b)) < 0.35) && guard++ < 20) {
      to = pickCity();
      if (guard % 5 === 0) from = pickCity();
    }
    latLonToVec3(from.lat, from.lon, 1, a);
    latLonToVec3(to.lat, to.lon, 1, b);
    const angle = a.angleTo(b);
    const lift = Math.min(0.5, 0.06 + angle * 0.2);
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3().crossVectors(a, b).normalize();
    const p = new THREE.Vector3();
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS;
      q.setFromAxisAngle(axis, angle * t);
      p.copy(a).applyQuaternion(q).multiplyScalar(R * (1.01 + lift * Math.sin(Math.PI * t)));
      arc.positions.set([p.x, p.y, p.z], k * 3);
    }
    (arc.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    arc.line.geometry.computeBoundingSphere();
    arc.from = from;
    arc.to = to;
    arc.duration = 1.8 + angle * 1.1 + Math.random() * 0.8;
    arc.start = this.uniforms.uTime.value + startOffset + Math.random() * 0.6;
    arc.arrived = false;
    arc.mat.uniforms.uColor.value.copy(Math.random() < 0.72 ? this.c.primary : this.c.secondary);
  }

  private buildRipples() {
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: this.c.primary, transparent: true, opacity: 0, depthWrite: false, blending: this.blend, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.globe.add(mesh);
      this.ripples.push({ mesh, mat, start: 0, active: false });
    }
  }

  private spawnRipple(city: City) {
    const r = this.ripples.find((x) => !x.active);
    if (!r) return;
    const p = latLonToVec3(city.lat, city.lon, R * 1.015);
    r.mesh.position.copy(p);
    r.mesh.lookAt(p.clone().multiplyScalar(2));
    r.mesh.visible = true;
    r.active = true;
    r.start = this.uniforms.uTime.value;
  }

  /** The logo sits at the centre, drawn over the dark core but under the front land dots and arcs. */
  private async buildLogo(url: string) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || 512;
    c.height = img.naturalHeight || 512;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // Anchor on the drawn shape's own centre, so it sits exactly at the globe's centre.
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let [x0, y0, x1, y1] = [c.width, c.height, 0, 0];
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (px[(y * c.width + x) * 4 + 3] > 8) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.NoColorSpace; // the pipeline is linear in, raw out
    map.anisotropy = 4;
    // On dark, tinted toward the globe's glow and kept (with the glass over it) below the
    // bloom threshold: anything that blooms reads as lying on top of the surface.
    const tint = this.c.light ? new THREE.Color(0xffffff) : new THREE.Color(0xffffff).lerp(this.c.primary, 0.35).multiplyScalar(0.8);
    const mat = new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, opacity: 0, color: tint });
    this.logo = new THREE.Sprite(mat);
    if (x1 > x0) this.logo.center.set((x0 + x1) / 2 / c.width, 1 - (y0 + y1) / 2 / c.height);
    this.logo.userData.aspect = c.width / c.height;
    this.logo.renderOrder = 1.5;
    this.root.add(this.logo);


    // The front surface, drawn over the logo.
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.99, 96, 96),
      new THREE.ShaderMaterial({
        vertexShader: coreVertex,
        fragmentShader: glassFragment,
        uniforms: { uBase: { value: this.c.base.clone() }, uRim: { value: this.c.secondary.clone() }, uReveal: this.uniforms.uReveal, uMin: { value: this.c.light ? 0.38 : 0.5 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    glass.renderOrder = 1.6;
    this.root.add(glass);
  }

  /**
   * Off the camera axis, perspective shifts a sphere's outline away from the projection of
   * its centre. Place the logo (at the centre's depth) where the outline's centre is on screen.
   */
  private centreLogo() {
    const logo = this.logo!;
    this.camera.updateMatrixWorld();
    const c = this.root.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.camera.matrixWorldInverse);
    const r = R * this.root.scale.x;
    const mid = (u: number) => {
      const d = Math.hypot(u, c.z);
      const th = Math.atan2(u, -c.z);
      const al = Math.asin(Math.min(1, r / d));
      return (Math.tan(th + al) + Math.tan(th - al)) / 2;
    };
    const p = new THREE.Vector3(mid(c.x) * -c.z, mid(c.y) * -c.z, c.z).applyMatrix4(this.camera.matrixWorld);
    logo.position.copy(this.root.worldToLocal(p));
  }

  /** Two rings pulsing out from Stockholm, where the company is. */
  private buildBeacon() {
    const sto = CITIES.find((c) => c.code === "STO") ?? CITIES[0];
    const p = latLonToVec3(sto.lat, sto.lon, R * 1.016);
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: this.c.hi, transparent: true, opacity: 0, depthWrite: false, blending: this.blend, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), mat);
      mesh.position.copy(p);
      mesh.lookAt(p.clone().multiplyScalar(2));
      mesh.renderOrder = 4;
      mesh.userData.phase = i / 2;
      this.globe.add(mesh);
      this.beacon.push(mesh);
    }
  }

  private makeGlyphAtlas() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#fff";
    ctx.font = "600 44px ui-monospace, 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    "0123456789ABCDEF".split("").forEach((ch, i) => ctx.fillText(ch, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34));
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private buildRings() {
    const atlas = this.makeGlyphAtlas();
    const configs = [
      { radius: R * 1.42, tilt: [1.25, 0.15, 0.3], speed: 0.06, color: this.c.primary },
      { radius: R * 1.58, tilt: [1.05, -0.35, -0.55], speed: -0.04, color: this.c.secondary },
    ];
    for (const cfg of configs) {
      const n = this.q.glyphs;
      const pos = new Float32Array(n * 3);
      const glyph = new Float32Array(n);
      const speed = new Float32Array(n);
      const rand = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const jitter = (Math.random() - 0.5) * 0.05;
        pos.set([Math.cos(a) * (cfg.radius + jitter), (Math.random() - 0.5) * 0.04, Math.sin(a) * (cfg.radius + jitter)], i * 3);
        glyph[i] = Math.floor(Math.random() * 16);
        speed[i] = 0.5 + Math.random() * 3;
        rand[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aGlyph", new THREE.BufferAttribute(glyph, 1));
      g.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
      g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: glyphVertex,
        fragmentShader: glyphFragment,
        uniforms: {
          uTime: this.uniforms.uTime,
          uPixelRatio: this.uniforms.uPixelRatio,
          uCenter: this.uniforms.uCenter,
          uSize: { value: 7.5 },
          uAtlas: { value: atlas },
          uColor: { value: cfg.color.clone() },
          uOpacity: { value: 0.85 },
        },
        transparent: true,
        depthWrite: false,
        blending: this.blend,
      });
      const ring = new THREE.Points(g, m);
      ring.renderOrder = 2;
      const holder = new THREE.Group();
      holder.rotation.set(cfg.tilt[0], cfg.tilt[1], cfg.tilt[2]);
      holder.add(ring);
      holder.userData.speed = cfg.speed;
      // "key" satellites travelling the ring
      const sats = 3;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sats * 3), 3));
      sg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(sats).fill(10), 1));
      sg.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(sats).fill(0.9), 1));
      const sc = new Float32Array(sats * 3);
      for (let i = 0; i < sats; i++) cfg.color.toArray(sc, i * 3);
      sg.setAttribute("aColor", new THREE.BufferAttribute(sc, 3));
      const satPoints = new THREE.Points(sg, this.spriteMaterial());
      satPoints.frustumCulled = false;
      satPoints.userData = { radius: cfg.radius, phase: Math.random() * 6.28, speed: cfg.speed * 6 };
      holder.add(satPoints);
      this.rings.add(holder);
    }
    this.tilt.add(this.rings);
  }

  private buildLattice() {
    const ico = new THREE.IcosahedronGeometry(R * 1.3, 3);
    const edges = new THREE.EdgesGeometry(ico, 1);
    this.lattice = new THREE.LineSegments(
      edges,
      new THREE.ShaderMaterial({
        vertexShader: latticeVertex,
        fragmentShader: latticeFragment,
        uniforms: { uCenter: this.uniforms.uCenter, uOpacity: { value: 0.03 }, uColor: { value: this.c.primary.clone() } },
        transparent: true,
        depthWrite: false,
        blending: this.blend,
      }),
    );
    this.lattice.renderOrder = 1;
    this.tilt.add(this.lattice);
  }

  private buildStars() {
    const n = this.q.stars;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const alpha = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(14 + Math.random() * 30);
      pos.set([v.x, v.y, v.z], i * 3);
      size[i] = 1.2 + Math.random() * 2.2;
      alpha[i] = 0.15 + Math.random() * 0.5;
      (Math.random() < 0.8 ? this.c.star : this.c.primary).toArray(color, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    this.stars = new THREE.Points(g, this.spriteMaterial());
    this.scene.add(this.stars);
  }

  private setupPost() {
    // Bloom adds light, which only reads on the dark theme.
    if (!this.q.bloom || this.c.light) return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Weaker than on an opaque black canvas: here the glow adds onto the page's own background.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0, 0.45);
    // Keep the glow tight: mips are blurred progressively (and composited x3), so
    // only the two finest levels contribute; otherwise the black background hazes.
    const factors = (this.bloom as unknown as { compositeMaterial: THREE.ShaderMaterial }).compositeMaterial.uniforms.bloomFactors;
    factors.value = [1.0, 0.6, 0.25, 0.06, 0.0];
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ---- public API ---------------------------------------------------------

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.size = { w, h };
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    this.uniforms.uPixelRatio.value = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const wide = aspect > 1.15;
    // The globe's diameter is `size` of the screen height (on portrait, at most 95% of the
    // width). Wide: centred vertically in the right column. Portrait: centred behind the copy.
    const fraction = wide ? this.opts.size : Math.min(this.opts.size, 0.95 * aspect);
    const halfH = R / fraction;
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(0, 0, dist);
    this.camera.updateProjectionMatrix();
    // The camera looks 35% of the way toward the globe, so a world offset moves it on screen by 65%.
    // Portrait: the globe sits behind the copy, so the logo stays faint there.
    this.root.userData.logoAlpha = wide ? 1 : 0.45;
    if (this.logo) {
      // Same on-screen height as the logo in its own column (pixels -> world units at the centre).
      const px = this.opts.logoHeight?.() || h * 0.24;
      const worldH = (px * 2 * halfH) / h;
      this.logo.scale.set(worldH * (this.logo.userData.aspect as number), worldH, 1);
    }
    this.root.userData.base = { x: wide ? (0.44 * halfH * aspect) / 0.65 : 0, y: 0 };
  }

  setPointer(nx: number, ny: number) {
    this.pointer.tx = nx;
    this.pointer.ty = ny;
  }

  /** 0 at the top of the hero, 1 when scrolled past it. */
  setScroll(p: number) {
    this.scroll = Math.min(1, Math.max(0, p));
    if (this.ready && !this.running) this.renderOnce();
  }

  dragStart(x: number, y: number) {
    this.drag.active = true;
    this.drag.lastX = x;
    this.drag.lastY = y;
  }

  dragMove(x: number, y: number) {
    if (!this.drag.active) return;
    const dx = x - this.drag.lastX;
    const dy = y - this.drag.lastY;
    this.drag.lastX = x;
    this.drag.lastY = y;
    this.drag.vy = dx * 0.0045;
    this.drag.vx = dy * 0.0025;
  }

  dragEnd() {
    this.drag.active = false;
  }

  /** Projects nodes to screen space and reports the nearest one under the cursor. */
  hoverAt(px: number, py: number) {
    let best: { d: number; i: number; x: number; y: number } | null = null;
    const v = new THREE.Vector3();
    const center = new THREE.Vector3();
    this.globe.getWorldPosition(center);
    const toCam = new THREE.Vector3();
    for (let i = 0; i < this.cityVecs.length; i++) {
      v.copy(this.cityVecs[i]).applyMatrix4(this.globe.matrixWorld);
      toCam.copy(this.camera.position).sub(v).normalize();
      if (v.clone().sub(center).normalize().dot(toCam) < 0.15) continue;
      v.project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * this.size.w;
      const sy = (-v.y * 0.5 + 0.5) * this.size.h;
      const d = Math.hypot(sx - px, sy - py);
      if (d < 22 && (!best || d < best.d)) best = { d, i, x: sx, y: sy };
    }
    const code = best ? CITIES[best.i].code : null;
    if (code === this.hovered) return;
    this.hovered = code;
    if (!best) return this.opts.onHover?.(null);
    const city = CITIES[best.i];
    this.opts.onHover?.({
      x: best.x,
      y: best.y,
      city,
      cipher: CIPHERS[(best.i * 7) % CIPHERS.length],
      latency: 8 + ((best.i * 37) % 90),
    });
  }

  start() {
    this.wantRunning = true;
    if (!this.ready || this.running || this.disposed || this.opts.reducedMotion) return;
    this.running = true;
    this.clock.reset();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.clock.update(t);
      this.tick(Math.min(this.clock.getDelta(), 0.05));
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.wantRunning = false;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private renderOnce() {
    this.tick(0);
  }

  private tick(dt: number) {
    const u = this.uniforms;
    u.uTime.value += dt;
    const time = u.uTime.value;
    u.uReveal.value = Math.min(1, u.uReveal.value + dt / 2.4);
    const reveal = 1 - Math.pow(1 - u.uReveal.value, 3);
    u.uScan.value = Math.sin(time * 0.35) * 1.05;


    // layout + scroll: zoom out and drift as the hero scrolls away
    const base = this.root.userData.base ?? { x: 0, y: 0 };
    const s = this.scroll;
    this.root.position.set(base.x + s * 1.4, base.y + s * 0.6, -s * 2.5);
    const scale = (0.86 + 0.14 * reveal) * (1 - s * 0.12);
    this.root.scale.setScalar(scale);
    this.root.getWorldPosition(u.uCenter.value);

    // rotation: auto spin + drag inertia
    if (!this.drag.active) {
      this.drag.vy *= 0.94;
      this.drag.vx *= 0.9;
    }
    this.drag.rotY += this.drag.vy;
    this.drag.rotX = THREE.MathUtils.clamp(this.drag.rotX + this.drag.vx, -0.5, 0.5);
    this.drag.vx *= 0.9;
    this.globe.rotation.y = this.baseRotation + time * 0.055 + this.drag.rotY + (1 - reveal) * -1.2 + s * 0.8;
    this.tilt.rotation.x = 0.32 + this.drag.rotX;

    // camera parallax
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.04;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.04;
    this.camera.position.x = this.pointer.x * 0.35;
    this.camera.position.y = -this.pointer.y * 0.22;
    this.camera.lookAt(base.x * 0.35, base.y * 0.35, 0);

    // rings
    for (const holder of this.rings.children) {
      holder.rotation.y += (holder.userData.speed as number) * dt;
      const sat = holder.children[1] as THREE.Points;
      const { radius, phase, speed } = sat.userData as { radius: number; phase: number; speed: number };
      const attr = sat.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const a = phase + time * speed + (i / attr.count) * Math.PI * 2;
        attr.setXYZ(i, Math.cos(a) * radius, 0, Math.sin(a) * radius);
      }
      attr.needsUpdate = true;
    }

    // arcs + packets
    const pAttr = this.packets.geometry.attributes.position as THREE.BufferAttribute;
    const pAlpha = this.packets.geometry.attributes.aAlpha as THREE.BufferAttribute;
    this.arcs.forEach((arc, i) => {
      if (this.opts.reducedMotion) {
        arc.mat.uniforms.uHead.value = 1.0;
        arc.mat.uniforms.uOpacity.value = 0.55;
        pAlpha.setX(i, 0);
        return;
      }
      const t = (time - arc.start) / arc.duration;
      const head = t * 1.32;
      arc.mat.uniforms.uHead.value = head;
      const fadeOut = head > 1.12 ? Math.max(0, 1 - (head - 1.12) / 0.2) : 1;
      arc.mat.uniforms.uOpacity.value = (t > 0 ? 1 : 0) * fadeOut * reveal;
      if (t > 0 && head <= 1) {
        const k = Math.min(SEGMENTS, Math.floor(head * SEGMENTS));
        pAttr.setXYZ(i, arc.positions[k * 3], arc.positions[k * 3 + 1], arc.positions[k * 3 + 2]);
        pAlpha.setX(i, reveal);
      } else {
        pAlpha.setX(i, 0);
      }
      if (!arc.arrived && head >= 1) {
        arc.arrived = true;
        this.spawnRipple(arc.to);
        this.latticePulse = Math.min(1, this.latticePulse + 0.35);
        this.opts.onArrival?.(arc.to);
      }
      if (head >= 1.32) this.respawnArc(arc, Math.random() * 0.8);
    });
    pAttr.needsUpdate = true;
    pAlpha.needsUpdate = true;

    // ripples
    for (const r of this.ripples) {
      if (!r.active) continue;
      const k = (time - r.start) / 1.4;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(0.015 + e * 0.15);
      r.mat.opacity = Math.pow(1 - k, 1.6) * 0.8;
    }

    // node pulse + lattice pulse
    const nAlpha = this.nodes.geometry.attributes.aAlpha as THREE.BufferAttribute;
    for (let i = 0; i < nAlpha.count; i++) nAlpha.setX(i, (0.65 + 0.35 * Math.sin(time * 2.2 + i)) * reveal);
    nAlpha.needsUpdate = true;
    this.latticePulse *= 0.97;
    (this.lattice.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (0.014 + this.latticePulse * 0.05) * reveal;

    if (this.stars) this.stars.rotation.y = time * 0.004;

    if (this.logo) {
      const a = reveal * ((this.root.userData.logoAlpha as number | undefined) ?? 1);
      (this.logo.material as THREE.SpriteMaterial).opacity = a;
      this.centreLogo();
    }
    for (const b of this.beacon) {
      const k = (time / 2.4 + (b.userData.phase as number)) % 1;
      b.scale.setScalar(0.03 + (1 - Math.pow(1 - k, 3)) * 0.26);
      (b.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - k, 1.4) * 0.9 * reveal;
    }

    // facing longitude/latitude for the HUD (approximate)
    if (this.opts.onLongitude && time - this.lastLonReport > 0.25) {
      this.lastLonReport = time;
      const deg = ((((-this.globe.rotation.y + this.baseRotation) * 180) / Math.PI + 15) % 360 + 540) % 360 - 180;
      this.opts.onLongitude(deg, 59.3 - this.drag.rotX * 40);
    }

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
  };

  dispose() {
    this.disposed = true;
    this.stop();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((mat) => mat.dispose());
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
