// Kept apart from globe.ts so checking support doesn't load three.js.
export function supportsWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
