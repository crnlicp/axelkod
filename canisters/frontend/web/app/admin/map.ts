// Map snapshot for the contact card: draws OpenStreetMap tiles centred on the
// coordinates onto a canvas in the admin's browser and returns a JPEG to upload,
// so site visitors never request anything from OpenStreetMap. Tiles allow CORS,
// which keeps the canvas exportable. © OpenStreetMap contributors (credited on the card).

const TILE = 256;
const ZOOM = 15;
const W = 1200;
const H = 900;

function loadTile(x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`tile ${ZOOM}/${x}/${y}`));
    img.src = `https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`;
  });
}

export async function mapSnapshot(lat: number, lon: number): Promise<File> {
  const n = 2 ** ZOOM;
  const rad = (lat * Math.PI) / 180;
  // Web Mercator: the coordinate's position in world pixels at this zoom.
  const cx = ((lon + 180) / 360) * n * TILE;
  const cy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n * TILE;
  const left = cx - W / 2, top = cy - H / 2;
  const x0 = Math.floor(left / TILE), x1 = Math.floor((left + W) / TILE);
  const y0 = Math.max(0, Math.floor(top / TILE)), y1 = Math.min(n - 1, Math.floor((top + H) / TILE));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const wrapped = ((x % n) + n) % n;
      jobs.push(loadTile(wrapped, y).then((img) => ctx.drawImage(img, x * TILE - left, y * TILE - top)));
    }
  }
  await Promise.all(jobs);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("could not encode the image");
  return new File([blob], "map.jpg", { type: "image/jpeg" });
}
