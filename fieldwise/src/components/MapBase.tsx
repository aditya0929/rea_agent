import { useEffect, type ReactNode } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "../types";

/** Satellite basemap with place labels. Esri imagery needs no key; attribution is required. */
export function MapBase({ center, zoom = 15, children, className }: {
  center: LatLng;
  zoom?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} maxZoom={19} zoomControl={false} className={className ?? "map"}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
        maxNativeZoom={18}
        maxZoom={19}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={18}
        maxZoom={19}
        opacity={0.8}
      />
      <ZoomButtons />
      {children}
    </MapContainer>
  );
}

function ZoomButtons() {
  const map = useMap();
  useEffect(() => {
    const z = L.control.zoom({ position: "bottomright" });
    z.addTo(map);
    return () => void z.remove();
  }, [map]);
  return null;
}

/** Fit the map to some points whenever `fitKey` changes. */
export function FitTo({ points, fitKey, padding = 40, padRight = 0 }: { points: LatLng[]; fitKey: string; padding?: number; padRight?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
      paddingTopLeft: [padding, padding],
      paddingBottomRight: [padding + padRight, padding],
      maxZoom: 18,
    });
    // Refit only when the caller changes fitKey, not on every new points array.
  }, [fitKey, map]);
  return null;
}

/** Imperatively fly to a point when `target` changes. */
export function FlyTo({ target }: { target: (LatLng & { key: string }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
  }, [target, map]);
  return null;
}

export const pinIcon = (cls: string, label?: string) =>
  L.divIcon({
    className: "",
    html: `<div class="pin ${cls}">${label ? `<span>${label}</span>` : ""}</div>`,
    iconSize: [0, 0],
  });
