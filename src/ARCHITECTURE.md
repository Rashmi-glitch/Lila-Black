# ARCHITECTURE.md — LILA BLACK Player Journey Visualizer

## What I Built

A fully client-side, browser-based visualization tool that lets Level Designers explore
player behavior across LILA BLACK's 3 maps. No backend, no server — just static files
served from Vercel.

---

## Tech Stack & Why

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend framework | React + Vite (TypeScript) | Fast dev iteration, clean component model, 1-click Vercel deploy |
| Map rendering | Leaflet.js + react-leaflet | Built-in pan/zoom on custom image layers; used in production game tools |
| Heatmap layer | leaflet.heat (CDN) | Lightweight canvas-based heatmap, no extra dependencies |
| Data format | Pre-processed JSON (per map) | Parquet can't run in browser without WASM overhead; Python pre-process is instant |
| Hosting | Vercel | Free, CDN-distributed, deploys straight from GitHub in 60 seconds |
| Data pipeline | Python + PyArrow + Pandas | Industry-standard parquet stack; runs once locally, output is static |

**Why not DuckDB-WASM?** It adds ~5MB WASM bundle and startup latency. Since data is
pre-processed offline, there's no query-time benefit. JSON loads faster and is simpler
to debug.

**Why not a backend?** Total data is ~17MB across 3 maps. Splitting by map brings each
file to ~5-6MB — well within browser fetch budget. A backend would add cost, complexity,
and a single point of failure for a tool used by an internal team.

---

## Data Flow

```
player_data/          minimaps/
(1,243 parquet files) (3 PNG/JPG images)
        │
        ▼
  process_data.py          ← runs once locally
  ├── reads each parquet file via PyArrow
  ├── decodes event bytes → UTF-8 string
  ├── detects bot vs human (UUID vs numeric user_id)
  ├── converts world (x,z) → pixel (px,py)  ← coordinate transform here
  ├── strips match_id .nakama-0 suffix
  └── writes events_AmbroseValley.json
      events_GrandRift.json
      events_Lockdown.json
        │
        ▼
  public/ folder (static assets in Vite)
  ├── events_AmbroseValley.json  (~6MB)
  ├── events_GrandRift.json      (~5MB)
  ├── events_Lockdown.json       (~5MB)
  └── minimap images (PNG/JPG)
        │
        ▼
  React App (browser)
  ├── fetch(/events_{map}.json) on map selection
  ├── filter by match_id, event type, bot flag, ts_ms
  ├── render paths as Leaflet polylines
  ├── render discrete events as CircleMarkers
  ├── render heatmap via L.heatLayer
  └── timeline slider scrubs ts_ms cutoff
```

---

## Coordinate Mapping (the tricky part)

Game world coordinates `(x, y, z)` are 3D. For the 2D minimap we use only `x` and `z`.
The `y` column is elevation — it is ignored entirely for plotting.

Each map has its own scale and world-space origin, defined in the README:

```
AmbroseValley: scale=900,  origin_x=-370, origin_z=-473
GrandRift:     scale=581,  origin_x=-290, origin_z=-290
Lockdown:      scale=1000, origin_x=-500, origin_z=-500
```

**World → UV → Pixel (1024×1024 image):**

```python
u = (x - origin_x) / scale          # 0.0 → 1.0 across map width
v = (z - origin_z) / scale          # 0.0 → 1.0 across map height

pixel_x = u * 1024
pixel_y = (1 - v) * 1024            # Y-FLIP: image origin is top-left,
                                     # game origin is bottom-left
```

**The Y-flip is critical.** Without it every coordinate appears mirrored
vertically — players appear in the wrong half of the map.

This transform runs in `process_data.py` at pre-process time. The React app
receives `pixel_x` and `pixel_y` directly and never touches raw world coords.

Leaflet's `CRS.Simple` treats the map as a flat `[0, 1024] × [0, 1024]`
coordinate space. We apply a second flip when converting pixel coords to
Leaflet LatLng: `latLng(1024 - pixel_y, pixel_x)` — because Leaflet's Simple
CRS has Y increasing upward, opposite to image pixel convention.

---

## Assumptions

| Situation | Assumption Made |
|-----------|----------------|
| `ts` column stores match-relative ms, not wall-clock time | Timestamps are sorted within a match but never compared across matches |
| February 14 is partial | Included as-is; no special handling needed since we filter by match not date |
| 3 files failed to parse | Skipped silently — 99.7% parse rate, likely corrupt/empty files |
| `match_id` has `.nakama-0` suffix in parquet | Stripped during pre-processing for cleaner display |
| Bot user_ids are short numeric strings | Detected via: `user_id` is all digits and length < 10 |
| Minimap images are exactly 1024×1024px | Confirmed from README; hardcoded IMAGE_SIZE=1024 |

---

## Major Tradeoffs

| Decision | Option A (chosen) | Option B (rejected) | Reason |
|----------|-------------------|---------------------|--------|
| Data delivery | Pre-process to JSON | DuckDB-WASM in browser | Faster load, simpler debugging, no WASM bundle |
| Map rendering | Leaflet ImageOverlay | Canvas 2D / WebGL | Leaflet gives pan/zoom/popup free; Canvas needs manual implementation |
| Data granularity | All 89k events in memory | Server-side filtering | Data fits in browser RAM; no backend needed |
| Per-map JSON files | Split by map (3 files) | Single events.json | Reduces initial load from 17MB to ~6MB per map |
| Heatmap library | leaflet.heat via CDN | deck.gl / Mapbox | leaflet.heat is 8KB; deck.gl is 500KB+ overkill for this use case |