import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, ImageOverlay, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

// ── Types ──────────────────────────────────────────────────────────────────────
interface GameEvent {
  user_id: string;
  match_id: string;
  map_id: string;
  event: string;
  ts_ms: number;
  pixel_x: number;
  pixel_y: number;
  is_bot: boolean;
}

// ── Map config (mirrors README exactly) ───────────────────────────────────────
const MAP_CONFIG: Record<string, { image: string; ext: string }> = {
  AmbroseValley: { image: "/AmbroseValley_Minimap.png", ext: "png" },
  GrandRift:     { image: "/GrandRift_Minimap.png",     ext: "png" },
  Lockdown:      { image: "/Lockdown_Minimap.jpg",      ext: "jpg" },
};

const IMAGE_SIZE = 1024;
// Leaflet ImageOverlay bounds — we treat the 1024x1024 image as a [0,1024] CRS square
const BOUNDS: L.LatLngBoundsExpression = [[0, 0], [IMAGE_SIZE, IMAGE_SIZE]];

// ── Event visual config ────────────────────────────────────────────────────────
const EVENT_COLOR: Record<string, string> = {
  Kill:           "#ef4444",
  Killed:         "#f97316",
  BotKill:        "#fb923c",
  BotKilled:      "#fbbf24",
  KilledByStorm:  "#a78bfa",
  Loot:           "#34d399",
  Position:       "#60a5fa",
  BotPosition:    "#94a3b8",
};

const EVENT_LABEL: Record<string, string> = {
  Kill: "⚔ Kill", Killed: "💀 Death", BotKill: "🤖⚔ Bot Kill",
  BotKilled: "🤖💀 Bot Killed", KilledByStorm: "🌪 Storm", Loot: "📦 Loot",
  Position: "👣 Path", BotPosition: "🤖 Bot Path",
};

// Convert pixel coords → Leaflet LatLng (y-axis flip: image top = high lat)
function pixelToLatLng(px: number, py: number): L.LatLng {
  return L.latLng(IMAGE_SIZE - py, px);
}

// ── Inner map component (has access to map instance) ──────────────────────────
function MapContent({
  events,
  visibleEvents,
  showBots,
  showHeatmap,
  timeMs,
  playing,
}: {
  events: GameEvent[];
  visibleEvents: Set<string>;
  showBots: boolean;
  showHeatmap: boolean;
  timeMs: number;
  playing: boolean;
}) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const heatRef  = useRef<any>(null);

  useEffect(() => {
    map.setView([IMAGE_SIZE / 2, IMAGE_SIZE / 2], 0);
  }, [map]);

  useEffect(() => {
    // Clear previous layers
    if (layerRef.current) layerRef.current.clearLayers();
    else { layerRef.current = L.layerGroup().addTo(map); }

    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }

    const filtered = events.filter(e => {
      if (!visibleEvents.has(e.event)) return false;
      if (!showBots && e.is_bot) return false;
      if (timeMs > 0 && e.ts_ms > timeMs) return false;
      return true;
    });

    if (showHeatmap) {
      // Heatmap layer for kill/death/storm events
      const heatData = filtered
        .filter(e => ["Kill","Killed","BotKill","BotKilled","KilledByStorm"].includes(e.event))
        .map(e => {
          const ll = pixelToLatLng(e.pixel_x, e.pixel_y);
          return [ll.lat, ll.lng, 1.0];
        });
      if ((window as any).L && (window as any).L.heatLayer) {
        heatRef.current = (window as any).L.heatLayer(heatData, {
          radius: 20, blur: 15, maxZoom: 4,
          gradient: { 0.2: "#3b82f6", 0.5: "#f59e0b", 1.0: "#ef4444" },
        }).addTo(map);
      }
      return;
    }

    // Group position events into paths per player
    const positionEvents = filtered.filter(
      e => e.event === "Position" || e.event === "BotPosition"
    );
    const paths: Record<string, GameEvent[]> = {};
    positionEvents.forEach(e => {
      const key = `${e.user_id}_${e.match_id}`;
      if (!paths[key]) paths[key] = [];
      paths[key].push(e);
    });

    Object.values(paths).forEach(pts => {
      const sorted = pts.sort((a, b) => a.ts_ms - b.ts_ms);
      const latlngs = sorted.map(p => pixelToLatLng(p.pixel_x, p.pixel_y));
      const isBot = sorted[0].is_bot;
      L.polyline(latlngs, {
        color: isBot ? "#94a3b8" : "#60a5fa",
        weight: isBot ? 1 : 1.5,
        opacity: isBot ? 0.3 : 0.5,
      }).addTo(layerRef.current!);
    });

    // Render discrete event markers
    const discreteEvents = filtered.filter(
      e => e.event !== "Position" && e.event !== "BotPosition"
    );
    discreteEvents.forEach(e => {
      const ll = pixelToLatLng(e.pixel_x, e.pixel_y);
      const color = EVENT_COLOR[e.event] || "#fff";
      const marker = L.circleMarker(ll, {
        radius: 5,
        fillColor: color,
        color: "#fff",
        weight: 1,
        fillOpacity: 0.9,
      });
      marker.bindPopup(`
        <b>${EVENT_LABEL[e.event] || e.event}</b><br/>
        Player: ${e.user_id.substring(0, 8)}…<br/>
        Match: ${e.match_id.substring(0, 8)}…<br/>
        ${e.is_bot ? "🤖 Bot" : "👤 Human"}<br/>
        T+${(e.ts_ms / 1000).toFixed(1)}s
      `);
      marker.addTo(layerRef.current!);
    });
  }, [events, visibleEvents, showBots, showHeatmap, timeMs, map, playing]);

  return <ImageOverlay url={MAP_CONFIG[events[0]?.map_id]?.image || ""} bounds={BOUNDS} />;
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedMap, setSelectedMap]       = useState("AmbroseValley");
  const [allEvents, setAllEvents]           = useState<GameEvent[]>([]);
  const [loading, setLoading]               = useState(false);
  const [selectedMatch, setSelectedMatch]   = useState<string>("ALL");
  //const [selectedDate, setSelectedDate]     = useState<string>("ALL");
  const [visibleEvents, setVisibleEvents]   = useState<Set<string>>(
    new Set(Object.keys(EVENT_COLOR))
  );
  const [showBots, setShowBots]             = useState(true);
  const [showHeatmap, setShowHeatmap]       = useState(false);
  const [timeMs, setTimeMs]                 = useState(0);
  const [playing, setPlaying]              = useState(false);
  const [maxTime, setMaxTime]               = useState(0);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load JSON when map changes
  useEffect(() => {
    setLoading(true);
    setAllEvents([]);
    setSelectedMatch("ALL");
    //setSelectedDate("ALL");
    setTimeMs(0);
    setPlaying(false);
    fetch(`/events_${selectedMap}.json`)
      .then(r => r.json())
      .then((data: GameEvent[]) => {
        setAllEvents(data);
        setMaxTime(Math.max(...data.map(e => e.ts_ms)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedMap]);

  // Derived: unique dates from match_ids (using ts_ms order as proxy)
  //const dates = ["ALL", "Feb 10", "Feb 11", "Feb 12", "Feb 13", "Feb 14"];

  // Unique matches for selected map
  const matches = ["ALL", ...Array.from(new Set(allEvents.map(e => e.match_id))).slice(0, 100)];

  // Filter events for rendering
  const filtered = allEvents.filter(e => {
    if (selectedMatch !== "ALL" && e.match_id !== selectedMatch) return false;
    return true;
  });

  // Toggle event type visibility
  const toggleEvent = (evt: string) => {
    setVisibleEvents(prev => {
      const next = new Set(prev);
      next.has(evt) ? next.delete(evt) : next.add(evt);
      return next;
    });
  };

  // Timeline playback
  const togglePlay = useCallback(() => {
    if (playing) {
      if (playRef.current) clearInterval(playRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      setTimeMs(0);
      playRef.current = setInterval(() => {
        setTimeMs(prev => {
          if (prev >= maxTime) {
            clearInterval(playRef.current!);
            setPlaying(false);
            return maxTime;
          }
          return prev + maxTime / 200; // 200 steps
        });
      }, 100);
    }
  }, [playing, maxTime]);

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="logo">🎮 LILA BLACK</div>
        <div className="logo-sub">Player Journey Visualizer</div>

        <label className="section-label">Map</label>
        {Object.keys(MAP_CONFIG).map(m => (
          <button
            key={m}
            className={`map-btn ${selectedMap === m ? "active" : ""}`}
            onClick={() => setSelectedMap(m)}
          >{m}</button>
        ))}

        <label className="section-label">Match</label>
        <select
          className="select"
          value={selectedMatch}
          onChange={e => setSelectedMatch(e.target.value)}
        >
          {matches.map(m => (
            <option key={m} value={m}>
              {m === "ALL" ? "All matches" : m.substring(0, 16) + "…"}
            </option>
          ))}
        </select>

        <label className="section-label">Events</label>
        {Object.entries(EVENT_LABEL)
          .filter(([k]) => k !== "Position" && k !== "BotPosition")
          .map(([k, label]) => (
          <label key={k} className="toggle-row">
            <input
              type="checkbox"
              checked={visibleEvents.has(k)}
              onChange={() => toggleEvent(k)}
            />
            <span className="dot" style={{ background: EVENT_COLOR[k] }} />
            {label}
          </label>
        ))}

        <label className="section-label">Paths</label>
        <label className="toggle-row">
          <input type="checkbox" checked={visibleEvents.has("Position")}
            onChange={() => { toggleEvent("Position"); toggleEvent("BotPosition"); }} />
          <span className="dot" style={{ background: "#60a5fa" }} />
          Show paths
        </label>

        <label className="section-label">Options</label>
        <label className="toggle-row">
          <input type="checkbox" checked={showBots} onChange={e => setShowBots(e.target.checked)} />
          <span className="dot" style={{ background: "#94a3b8" }} />
          Show bots
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
          <span className="dot" style={{ background: "#ef4444" }} />
          Heatmap mode
        </label>

        <div className="stat-box">
          <div className="stat">{filtered.length.toLocaleString()}</div>
          <div className="stat-label">events loaded</div>
          <div className="stat">{new Set(filtered.map(e => e.match_id)).size}</div>
          <div className="stat-label">matches</div>
          <div className="stat">
            {new Set(filtered.filter(e => !e.is_bot).map(e => e.user_id)).size}
          </div>
          <div className="stat-label">human players</div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="main">
        {loading && <div className="loading">Loading {selectedMap} data…</div>}

        {!loading && filtered.length > 0 && (
          <MapContainer
            key={selectedMap}
            crs={L.CRS.Simple}
            bounds={BOUNDS}
            style={{ width: "100%", height: "calc(100vh - 80px)" }}
            maxZoom={4}
            minZoom={-2}
          >
            <MapContent
              events={filtered}
              visibleEvents={visibleEvents}
              showBots={showBots}
              showHeatmap={showHeatmap}
              timeMs={timeMs === 0 && !playing ? Infinity : timeMs}
              playing={playing}
            />
          </MapContainer>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty">Select a map to begin exploring</div>
        )}

        {/* ── Timeline ── */}
        <div className="timeline">
          <button className="play-btn" onClick={togglePlay}>
            {playing ? "⏸ Pause" : "▶ Play match"}
          </button>
          <input
            type="range"
            min={0}
            max={maxTime}
            value={timeMs}
            onChange={e => { setTimeMs(Number(e.target.value)); setPlaying(false); }}
            className="slider"
          />
          <span className="time-label">
            {timeMs === 0 ? "All time" : `T+${(timeMs / 1000).toFixed(0)}s`}
          </span>
          <button className="reset-btn" onClick={() => { setTimeMs(0); setPlaying(false); }}>
            ↺ Reset
          </button>
        </div>
      </main>
    </div>
  );
}