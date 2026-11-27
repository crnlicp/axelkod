/** Network nodes shown on the globe (illustrative edge locations). */
export interface City {
  code: string;
  name: string;
  lat: number;
  lon: number;
  hub?: boolean;
}

export const CITIES: City[] = [
  { code: "STO", name: "Stockholm", lat: 59.33, lon: 18.07, hub: true },
  { code: "GOT", name: "Göteborg", lat: 57.71, lon: 11.97 },
  { code: "OSL", name: "Oslo", lat: 59.91, lon: 10.75 },
  { code: "CPH", name: "København", lat: 55.68, lon: 12.57 },
  { code: "HEL", name: "Helsinki", lat: 60.17, lon: 24.94 },
  { code: "REK", name: "Reykjavík", lat: 64.15, lon: -21.94 },
  { code: "LON", name: "London", lat: 51.51, lon: -0.13, hub: true },
  { code: "AMS", name: "Amsterdam", lat: 52.37, lon: 4.9 },
  { code: "FRA", name: "Frankfurt", lat: 50.11, lon: 8.68, hub: true },
  { code: "PAR", name: "Paris", lat: 48.86, lon: 2.35 },
  { code: "MAD", name: "Madrid", lat: 40.42, lon: -3.7 },
  { code: "ZRH", name: "Zürich", lat: 47.37, lon: 8.54 },
  { code: "WAW", name: "Warszawa", lat: 52.23, lon: 21.01 },
  { code: "IST", name: "Istanbul", lat: 41.01, lon: 28.98 },
  { code: "NYC", name: "New York", lat: 40.71, lon: -74.0, hub: true },
  { code: "TOR", name: "Toronto", lat: 43.65, lon: -79.38 },
  { code: "CHI", name: "Chicago", lat: 41.88, lon: -87.63 },
  { code: "SFO", name: "San Francisco", lat: 37.77, lon: -122.42 },
  { code: "SEA", name: "Seattle", lat: 47.61, lon: -122.33 },
  { code: "DFW", name: "Dallas", lat: 32.78, lon: -96.8 },
  { code: "MIA", name: "Miami", lat: 25.76, lon: -80.19 },
  { code: "MEX", name: "Ciudad de México", lat: 19.43, lon: -99.13 },
  { code: "BOG", name: "Bogotá", lat: 4.71, lon: -74.07 },
  { code: "GRU", name: "São Paulo", lat: -23.55, lon: -46.63, hub: true },
  { code: "EZE", name: "Buenos Aires", lat: -34.6, lon: -58.38 },
  { code: "LOS", name: "Lagos", lat: 6.52, lon: 3.38 },
  { code: "NBO", name: "Nairobi", lat: -1.29, lon: 36.82 },
  { code: "JNB", name: "Johannesburg", lat: -26.2, lon: 28.05 },
  { code: "CAI", name: "Cairo", lat: 30.04, lon: 31.24 },
  { code: "DXB", name: "Dubai", lat: 25.2, lon: 55.27, hub: true },
  { code: "BOM", name: "Mumbai", lat: 19.08, lon: 72.88 },
  { code: "BLR", name: "Bengaluru", lat: 12.97, lon: 77.59 },
  { code: "SIN", name: "Singapore", lat: 1.35, lon: 103.82, hub: true },
  { code: "JKT", name: "Jakarta", lat: -6.21, lon: 106.85 },
  { code: "HKG", name: "Hong Kong", lat: 22.32, lon: 114.17 },
  { code: "SEL", name: "Seoul", lat: 37.57, lon: 126.98 },
  { code: "TYO", name: "Tokyo", lat: 35.68, lon: 139.69, hub: true },
  { code: "SYD", name: "Sydney", lat: -33.87, lon: 151.21, hub: true },
  { code: "MEL", name: "Melbourne", lat: -37.81, lon: 144.96 },
  { code: "AKL", name: "Auckland", lat: -36.85, lon: 174.76 },
];

export const CIPHERS = ["TLS 1.3 · AES-256-GCM", "TLS 1.3 · ChaCha20-Poly1305", "X25519MLKEM768 · AES-256-GCM", "WireGuard · ChaCha20", "IPsec · AES-256-GCM", "Ed25519 · SHA-256"];
