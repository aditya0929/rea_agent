import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Marker, Polygon, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { LatLng, PlanId } from "../../types";
import { useCurrentUser, useStore } from "../../store/store";
import { useFx } from "../../fx/Fx";
import { areaM2, centroid, circlePoints, formatArea, formatDistance, haToAcres, MIN_POINTS, parseBoundaryFile, parseCoordinates, perimeterM } from "../../lib/geo";
import { FitTo, FlyTo, MapBase } from "../../components/MapBase";
import { Icon } from "../../components/Icon";
import { DetailsStep, type Details } from "./DetailsStep";
import { PlanStep } from "./PlanStep";

type Method = "tap" | "circle";
const PRESETS = [50, 100, 250, 500, 1000];

const vertexIcon = L.divIcon({ className: "", html: '<div class="vertex"></div>', iconSize: [0, 0] });
const centerIcon = L.divIcon({ className: "", html: '<div class="vertex vertex-center"></div>', iconSize: [0, 0] });
const handleIcon = L.divIcon({ className: "", html: '<div class="vertex vertex-handle"></div>', iconSize: [0, 0] });

function MapClicks({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const distanceM = (a: LatLng, b: LatLng) => L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));

export default function Wizard() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const { fields, addField } = useStore();
  const { play } = useFx();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<Method>("tap");
  const [points, setPoints] = useState<LatLng[]>([]);
  const [circle, setCircle] = useState<{ center: LatLng; radius: number } | null>(null);
  const [fit, setFit] = useState<{ key: string; points: LatLng[] }>({ key: "start", points: [] });
  const [fly, setFly] = useState<(LatLng & { key: string }) | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{ tone: "critical" | "info"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState<Details>({
    fieldName: "",
    crop: "",
    sowingDate: new Date().toISOString().slice(0, 10),
    contactName: me?.name ?? "",
    phone: me?.phone ?? "",
    email: me?.email ?? "",
    company: "",
  });

  const boundary = useMemo(
    () => (method === "circle" && circle ? circlePoints(circle.center, circle.radius) : points),
    [method, circle, points],
  );
  const ready = boundary.length >= MIN_POINTS;
  const ha = areaM2(boundary) / 10_000;
  const perim = perimeterM(boundary);
  const start = fields[fields.length - 1]?.boundary[0] ?? { lat: 20.0112, lng: 73.7095 };

  const onMapClick = (p: LatLng) => {
    if (step !== 1) return;
    if (method === "tap") setPoints((pts) => [...pts, p]);
    else setCircle((c) => ({ center: p, radius: c?.radius ?? 100 }));
  };

  const chooseMethod = (m: Method) => {
    setMethod(m);
    setMessage(m === "circle" ? { tone: "info", text: "Click the centre of the plot, then drag the centre or edge handle to fit." } : { tone: "info", text: "Click each corner of the field in order." });
  };

  const search = async () => {
    const coords = parseCoordinates(query);
    if (coords) return setFly({ ...coords, key: query + Date.now() });
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const [hit] = await res.json();
      if (hit) setFly({ lat: Number(hit.lat), lng: Number(hit.lon), key: hit.place_id + "" });
      else setMessage({ tone: "critical", text: `Couldn't find “${query}”. Try a town name or “lat, lng”.` });
    } catch {
      setMessage({ tone: "critical", text: "Place search is unavailable. Enter coordinates as “lat, lng” instead." });
    } finally {
      setSearching(false);
    }
  };

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setFly({ lat: p.coords.latitude, lng: p.coords.longitude, key: `me${Date.now()}` }),
      () => setMessage({ tone: "critical", text: "Location permission was denied." }),
    );

  const upload = async (file: File) => {
    try {
      const pts = await parseBoundaryFile(file);
      setMethod("tap");
      setCircle(null);
      setPoints(pts);
      setFit({ key: file.name + Date.now(), points: pts });
      setMessage({ tone: "info", text: `Loaded ${pts.length} points from ${file.name}. Drag any corner to adjust.` });
    } catch (e) {
      setMessage({ tone: "critical", text: (e as Error).message });
    }
  };

  const clear = () => {
    setPoints([]);
    setCircle(null);
    setMessage(null);
  };

  const create = (plan: PlanId) => {
    const field = addField({
      name: details.fieldName.trim(),
      crop: details.crop,
      sowingDate: details.sowingDate,
      boundary,
      areaHa: ha,
      perimeterM: perim,
      plan,
      contact: { name: details.contactName, phone: details.phone, email: details.email, company: details.company || undefined },
    });
    play({ caption: `Tasking a satellite over ${field.name}`, sub: "Requesting 60 days of imagery for the new boundary", focus: centroid(boundary), ms: 2600 });
    navigate("/");
  };

  const stepNames = ["Boundary", "Field details", "Plan"];

  return (
    <div className="wizard">
      <header className="wizard-bar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>
        <ol className="stepper">
          {stepNames.map((s, i) => (
            <li key={s} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}>
              <span>{step > i + 1 ? <Icon name="check" size={13} /> : i + 1}</span>{s}
            </li>
          ))}
        </ol>
        <form className="search" onSubmit={(e) => (e.preventDefault(), search())}>
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a place or “lat, lng”" />
          {searching && <span className="spinner" />}
        </form>
        <button className="btn btn-sm" onClick={locate}><Icon name="target" size={14} /> My location</button>
      </header>

      <div className="wizard-body">
        <MapBase center={start} zoom={16} className="map">
          <MapClicks onClick={onMapClick} />
          <FitTo points={fit.points} fitKey={fit.key} padding={80} />
          {/* Keep the boundary visible beside the details and plan panels. */}
          {step > 1 && <FitTo points={boundary} fitKey={`step${step}`} padding={60} padRight={step === 2 ? 560 : 900} />}
          <FlyTo target={fly} />
          {ready && <Polygon positions={boundary.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#d9f99d", weight: 3, fillColor: "#d9f99d", fillOpacity: 0.18 }} />}
          {!ready && method === "tap" && points.length > 1 && <Polyline positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#d9f99d", weight: 3, dashArray: "6 6" }} />}
          {step === 1 && method === "tap" && points.map((p, i) => (
            <Marker
              key={i}
              position={[p.lat, p.lng]}
              icon={vertexIcon}
              draggable
              eventHandlers={{ dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                setPoints((pts) => pts.map((q, j) => (j === i ? { lat: ll.lat, lng: ll.lng } : q)));
              } }}
            />
          ))}
          {step === 1 && method === "circle" && circle && (
            <>
              <Marker
                position={[circle.center.lat, circle.center.lng]}
                icon={centerIcon}
                draggable
                eventHandlers={{ drag: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  setCircle((c) => c && { ...c, center: { lat: ll.lat, lng: ll.lng } });
                } }}
              />
              <Marker
                position={[circle.center.lat, circlePoints(circle.center, circle.radius, 4)[1].lng]}
                icon={handleIcon}
                draggable
                eventHandlers={{ drag: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  setCircle((c) => c && { ...c, radius: Math.max(10, Math.round(distanceM(c.center, { lat: ll.lat, lng: ll.lng }))) });
                } }}
              />
            </>
          )}
        </MapBase>

        {step === 1 && (
          <aside className="float-panel left">
            <div className="eyebrow">Step 1 · Boundary</div>
            <h2>Map your field</h2>
            <div className="methods">
              <button className={method === "tap" ? "active" : ""} onClick={() => chooseMethod("tap")}>
                <Icon name="pointer" /><b>Tap points</b><small>Click each corner</small>
              </button>
              <button className={method === "circle" ? "active" : ""} onClick={() => chooseMethod("circle")}>
                <Icon name="circle" /><b>Draw circle</b><small>Round plots, pivots</small>
              </button>
              <button onClick={() => fileRef.current?.click()}>
                <Icon name="upload" /><b>Upload file</b><small>KML, KMZ, GeoJSON</small>
              </button>
              <input ref={fileRef} type="file" accept=".kml,.kmz,.geojson,.json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
            {message && <p className={`note ${message.tone === "critical" ? "note-critical" : ""}`}>{message.text}</p>}
            {method === "circle" && (
              <div className="radius">
                <div className="row between"><span>Radius</span><b>{circle ? formatDistance(circle.radius) : "–"}</b></div>
                <input
                  type="range"
                  min={10}
                  max={1500}
                  step={5}
                  value={circle?.radius ?? 100}
                  disabled={!circle}
                  onChange={(e) => setCircle((c) => c && { ...c, radius: Number(e.target.value) })}
                  aria-label="Radius in metres"
                />
                <div className="chips">
                  {PRESETS.map((r) => (
                    <button key={r} className={`chip chip-btn ${circle?.radius === r ? "active" : ""}`} disabled={!circle} onClick={() => setCircle((c) => c && { ...c, radius: r })}>
                      {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row gap-s">
              {method === "tap" && <button className="btn btn-sm" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}><Icon name="undo" size={14} /> Undo point</button>}
              <button className="btn btn-sm btn-danger-ghost" disabled={!points.length && !circle} onClick={clear}><Icon name="trash" size={14} /> Clear</button>
            </div>
          </aside>
        )}

        {step === 2 && (
          <DetailsStep
            details={details}
            onChange={setDetails}
            areaHa={ha}
            points={boundary.length}
            perimeter={perim}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && <PlanStep areaHa={ha} fieldName={details.fieldName} onBack={() => setStep(2)} onCreate={create} />}

        {step === 1 && (
          <div className="stats-bar">
            <div><small>Area</small><b>{formatArea(ha)} <span>ha</span></b><small>{formatArea(haToAcres(ha))} acres</small></div>
            <div><small>Perimeter</small><b>{formatDistance(perim)}</b></div>
            <div><small>Points</small><b>{boundary.length} <span>/ min {MIN_POINTS}</span></b><small>{method === "tap" ? "Drag to adjust" : "64-point circle"}</small></div>
            <button className="btn btn-primary btn-lg" disabled={!ready} onClick={() => setStep(2)}>
              Continue to field details <Icon name="chevron" size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
