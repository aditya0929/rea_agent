// Build a satellite image for a lat/lng box by stitching Esri World Imagery tiles.
// Tiles are pre-rendered and cached, so this is far faster than the on-demand export endpoint.
const TILE = 256;
const tileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z * TILE;
const latToY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * TILE;
};

const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/**
 * Returns a canvas covering exactly the box, about `targetPx` wide.
 * Rows are resampled from Web Mercator to linear latitude so the image maps evenly onto a flat slab.
 */
export async function stitchImagery(minLng: number, minLat: number, maxLng: number, maxLat: number, targetPx = 2048, maxZoom = 18) {
  const widthDeg = maxLng - minLng;
  const z = Math.max(1, Math.min(maxZoom, Math.floor(Math.log2((targetPx * 360) / (widthDeg * TILE)))));
  const x0 = lngToX(minLng, z), x1 = lngToX(maxLng, z);
  const y0 = latToY(maxLat, z), y1 = latToY(minLat, z);
  const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor(x1 / TILE), ty0 = Math.floor(y0 / TILE), ty1 = Math.floor(y1 / TILE);

  const mosaic = document.createElement("canvas");
  mosaic.width = (tx1 - tx0 + 1) * TILE;
  mosaic.height = (ty1 - ty0 + 1) * TILE;
  const mg = mosaic.getContext("2d")!;
  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(loadImg(tileUrl(z, tx, ty)).then((img) => {
        if (img) mg.drawImage(img, (tx - tx0) * TILE, (ty - ty0) * TILE);
      }));
    }
  }
  await Promise.all(jobs);

  // Crop to the box, mapping each output row to its Mercator row.
  const outW = Math.round(x1 - x0);
  const outH = Math.max(1, Math.round(outW * ((maxLat - minLat) / widthDeg) * (1 / Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180))));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const og = out.getContext("2d")!;
  const strip = 4;
  for (let row = 0; row < outH; row += strip) {
    const lat = maxLat - ((row + strip / 2) / outH) * (maxLat - minLat);
    const sy = latToY(lat, z) - ty0 * TILE;
    const sh = ((y1 - y0) / outH) * strip;
    og.drawImage(mosaic, x0 - tx0 * TILE, sy - sh / 2, x1 - x0, sh, 0, row, outW, strip);
  }
  return out;
}
