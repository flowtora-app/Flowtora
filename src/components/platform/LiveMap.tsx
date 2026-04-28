"use client";

import * as React from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

// Live visitor map for the analytics dashboard.
//
// Renders a flat Equal Earth projection of the world with one dot per
// active session in the last N minutes. Uses react-simple-maps + a
// public TopoJSON of countries from world-atlas (served via jsdelivr,
// so no static asset to ship). Pure SVG — no tile loading, no API
// keys, no per-render network cost beyond the one-time topo fetch.

// Public-CDN URL for the world-atlas 110m TopoJSON. ~30KB, cached
// hard by jsdelivr's CDN. Same one react-simple-maps' docs use.
const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export interface LiveDot {
  /** [longitude, latitude] in decimal degrees. */
  coordinates: [number, number];
  /** Friendly label shown on hover (e.g. "San Francisco · US"). */
  label: string;
  /** Stable identifier so reused dots don't re-animate. */
  key: string;
}

export interface LiveMapProps {
  dots: LiveDot[];
  /** SVG height in px. Width auto-fits the container. */
  height?: number;
}

export function LiveMap({ dots, height = 360 }: LiveMapProps) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        height,
      }}
    >
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 155 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={TOPO_URL}>
          {({ geographies }: { geographies: Array<{ rsmKey: string }> }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="var(--surface-3)"
                stroke="var(--border-subtle)"
                strokeWidth={0.5}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "var(--surface-2)" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {dots.map((dot) => (
          <Marker key={dot.key} coordinates={dot.coordinates}>
            {/* Outer pulse ring — animated halo for life. */}
            <circle
              r={9}
              fill="var(--accent-primary)"
              fillOpacity={0.18}
              className="ts-live-pulse"
            />
            {/* Solid core dot. */}
            <circle
              r={4}
              fill="var(--accent-primary)"
              stroke="var(--surface-1)"
              strokeWidth={1.5}
            >
              <title>{dot.label}</title>
            </circle>
          </Marker>
        ))}
      </ComposableMap>

      {dots.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No live visitors right now
        </div>
      )}

      {/* Inline pulse animation — kept local so the map ships
          self-contained instead of polluting globals.css. */}
      <style>{`
        @keyframes ts-live-pulse {
          0%   { transform: scale(0.8); opacity: 0.55; }
          70%  { transform: scale(2.2); opacity: 0;    }
          100% { transform: scale(2.2); opacity: 0;    }
        }
        .ts-live-pulse {
          transform-origin: center;
          transform-box: fill-box;
          animation: ts-live-pulse 2s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
