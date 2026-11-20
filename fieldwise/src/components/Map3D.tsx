import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, ImageSource, Map as MLMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 loads its worker as a separate module; give it an explicit URL.
// ?worker&url bundles the worker with its shared chunk, so it also works in production builds.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);
import type { FeatureCollection } from "geojson";
import type { Field, LatLng } from "../types";
import { bbox } from "../lib/geo";
import type { ZoneMap } from "../lib/sat";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    labels: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
    },
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 14,
      encoding: "terrarium",
      attribution: "Terrain: Mapzen / AWS Open Data",
    },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": 0.05, "raster-contrast": 0.08 } },
    { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.75 } },
  ],
  sky: {
    "sky-color": "#08213a",
    "horizon-color": "#8cc8ea",
    "fog-color": "#a9d4ec",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.85,
    "atmosphere-blend": 0.8,
  },
};

export interface MapMarker {
  id: string;
  position: LatLng;
  className: string;
  label?: string;
  title?: string;
  onClick?: () => void;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function fieldsGeoJSON(fields: Field[], selectedId: string | null, processing: Set<string>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fields.map((f) => ({
      type: "Feature",
      properties: { id: f.id, name: f.name, selected: f.id === selectedId, processing: processing.has(f.id) },
      geometry: { type: "Polygon", coordinates: [[...f.boundary, f.boundary[0]].map((p) => [p.lng, p.lat])] },
    })),
  };
}

export function Map3D({ fields, selectedId, processingIds, zones, threeD, fitKey, flyTo, markers, onSelectField }: {
  fields: Field[];
  selectedId: string | null;
  processingIds: Set<string>;
  /** Classified zone raster for the selected field, draped on the terrain. */
  zones: ZoneMap | null;
  threeD: boolean;
  fitKey: string;
  flyTo: (LatLng & { key: string }) | null;
  markers: MapMarker[];
  onSelectField: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const pending = useRef<(() => void)[]>([]);
  const markerObjs = useRef<maplibregl.Marker[]>([]);
  const selectRef = useRef(onSelectField);
  selectRef.current = onSelectField;

  // Run once the style has loaded.
  const whenReady = (fn: () => void) => (ready.current ? fn() : pending.current.push(fn));

  useEffect(() => {
    const first = fields.find((f) => f.id === selectedId) ?? fields[0];
    const map = new maplibregl.Map({
      container: host.current!,
      style: STYLE,
      center: first ? [first.boundary[0].lng, first.boundary[0].lat] : [73.7, 20],
      zoom: first ? 14 : 3,
      pitch: 0,
      maxPitch: 78,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), "bottom-right");
    map.on("load", () => {
      map.setTerrain({ source: "dem", exaggeration: 1.4 });
      map.addSource("fields", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "fields-fill", type: "fill", source: "fields",
        paint: { "fill-color": ["case", ["get", "processing"], "#c6f432", "#ffffff"], "fill-opacity": ["case", ["get", "selected"], 0.0, 0.12] },
      });
      map.addLayer({
        id: "fields-glow", type: "line", source: "fields",
        paint: { "line-color": ["case", ["get", "selected"], "#c6f432", "#ffffff"], "line-width": ["case", ["get", "selected"], 10, 0], "line-blur": 8, "line-opacity": 0.55 },
      });
      const lineColor: maplibregl.ExpressionSpecification = ["case", ["get", "selected"], "#e8ffb0", "#ffffff"];
      const lineWidth: maplibregl.ExpressionSpecification = ["case", ["get", "selected"], 3, 1.6];
      map.addLayer({ id: "fields-line", type: "line", source: "fields", filter: ["!", ["get", "processing"]], paint: { "line-color": lineColor, "line-width": lineWidth } });
      // Dash patterns can't vary per feature, so fields still processing get their own layer.
      map.addLayer({
        id: "fields-line-processing", type: "line", source: "fields", filter: ["get", "processing"],
        paint: { "line-color": lineColor, "line-width": lineWidth, "line-dasharray": [2, 2] },
      });
      map.on("click", "fields-fill", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) selectRef.current(String(id));
      });
      map.on("mouseenter", "fields-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "fields-fill", () => (map.getCanvas().style.cursor = ""));
      ready.current = true;
      pending.current.splice(0).forEach((fn) => fn());
    });
    return () => {
      ready.current = false;
      markerObjs.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; props are pushed in by the effects below.
  }, []);

  // Field outlines.
  useEffect(() => {
    whenReady(() => (mapRef.current!.getSource("fields") as GeoJSONSource).setData(fieldsGeoJSON(fields, selectedId, processingIds)));
  }, [fields, selectedId, processingIds]);

  // Zone raster: one image source, updated in place when the layer or pass changes.
  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current!;
      const src = map.getSource("zones") as ImageSource | undefined;
      if (!zones) {
        if (map.getLayer("zones")) map.removeLayer("zones");
        if (src) map.removeSource("zones");
        return;
      }
      if (src) src.updateImage({ url: zones.url, coordinates: zones.corners });
      else {
        map.addSource("zones", { type: "image", url: zones.url, coordinates: zones.corners });
        // Above the imagery, below the field outlines.
        map.addLayer({ id: "zones", type: "raster", source: "zones", paint: { "raster-opacity": 0.92, "raster-resampling": "linear", "raster-fade-duration": 250 } }, "fields-glow");
      }
    });
  }, [zones]);

  // Cinematic fit: frame the field, tilted and slightly rotated in 3D.
  useEffect(() => {
    const f = fields.find((x) => x.id === selectedId);
    if (!f) return;
    whenReady(() => {
      const map = mapRef.current!;
      const b = bbox(f.boundary);
      const cam = map.cameraForBounds([[b.minLng, b.minLat], [b.maxLng, b.maxLat]], { padding: { top: 120, bottom: 140, left: 460, right: 120 } });
      if (!cam) return;
      map.flyTo({ ...cam, zoom: Math.min(17.6, (cam.zoom ?? 16) - (threeD ? 0.3 : 0)), pitch: threeD ? 62 : 0, bearing: threeD ? -24 : 0, duration: 2600, essential: true, curve: 1.6 });
    });
    // Refit when the caller says so (field change, 2D/3D switch), not on every render.
  }, [fitKey]);

  useEffect(() => {
    if (flyTo) whenReady(() => mapRef.current!.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 18, duration: 1400, essential: true }));
  }, [flyTo]);

  // HTML markers (zones, field work).
  useEffect(() => {
    whenReady(() => {
      markerObjs.current.forEach((m) => m.remove());
      markerObjs.current = markers.map((m) => {
        const el = document.createElement("div");
        el.className = `mk ${m.className}`;
        if (m.label) el.innerHTML = `<span>${m.label}</span>`;
        if (m.title) el.title = m.title;
        if (m.onClick) el.addEventListener("click", (e) => (e.stopPropagation(), m.onClick!()));
        return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([m.position.lng, m.position.lat]).addTo(mapRef.current!);
      });
    });
  }, [markers]);

  return <div className="map3d" ref={host} />;
}
