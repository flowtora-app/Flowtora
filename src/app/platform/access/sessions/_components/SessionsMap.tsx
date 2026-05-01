"use client";

import * as React from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { flagEmoji } from "@/lib/country-codes";
import type { MapBubble } from "@/server/platform/sessions";

// SessionsMap — light bubble map of active platform-admin sessions
// per country. Shares the same TopoJSON as the dashboard tenant map.

const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface MapFeature {
  rsmKey: string;
  id: string;
  properties?: { name?: string; iso_a2?: string };
}

// Tiny ISO-numeric → ISO-2 lookup just for the countries the bubbles
// can land on. We could go full ISO-3166 but only need a handful for
// our admin staff today; the caller can pass through any 2-letter
// code and we render a pin with the flag emoji.
//
// Source ISO-numeric codes come from the world-atlas TopoJSON.

export function SessionsMap({ bubbles }: { bubbles: MapBubble[] }) {
  const byIso2 = React.useMemo(
    () => new Map(bubbles.map((b) => [b.country.toUpperCase(), b])),
    [bubbles],
  );
  const total = bubbles.reduce((acc, b) => acc + b.count, 0);
  const max = Math.max(1, ...bubbles.map((b) => b.count));

  const [hover, setHover] = React.useState<MapBubble | null>(null);

  return (
    <Card>
      <CardHeader
        title="Active sessions by country"
        description={`${total.toLocaleString()} active session${total === 1 ? "" : "s"} across ${bubbles.length} country/countries.`}
      />
      <CardBody>
        {bubbles.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-[12px]"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
            No country signal on active sessions yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
            <div style={{ height: 320 }}>
              <ComposableMap projectionConfig={{ scale: 130 }} style={{ width: "100%", height: "100%" }}>
                <Geographies geography={TOPO_URL}>
                  {({ geographies }: { geographies: MapFeature[] }) => (
                    <>
                      {geographies.map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="var(--surface-2)"
                          stroke="var(--border-subtle)"
                          strokeWidth={0.4}
                          style={{
                            default: { outline: "none" },
                            hover:   { outline: "none", fill: "var(--surface-3)" },
                            pressed: { outline: "none" },
                          }}
                        />
                      ))}
                      {geographies.map((geo) => {
                        const iso2 = geo.properties?.iso_a2?.toUpperCase();
                        if (!iso2) return null;
                        const bubble = byIso2.get(iso2);
                        if (!bubble) return null;
                        const [lon, lat] = geoCentroid(geo as never) as [number, number];
                        const radius = 4 + Math.sqrt(bubble.count / max) * 12;
                        return (
                          <Marker key={`${geo.rsmKey}-pin`} coordinates={[lon, lat]}>
                            <circle
                              r={radius}
                              fill="var(--accent-primary)"
                              fillOpacity={0.55}
                              stroke="var(--accent-primary)"
                              strokeWidth={1}
                              onMouseEnter={() => setHover(bubble)}
                              onMouseLeave={() => setHover(null)}
                              style={{ cursor: "pointer" }}
                            />
                          </Marker>
                        );
                      })}
                    </>
                  )}
                </Geographies>
              </ComposableMap>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Top countries
              </div>
              <ul className="space-y-1">
                {bubbles.slice(0, 10).map((b) => (
                  <li key={b.country}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[12px]"
                      style={{
                        background: hover?.country === b.country ? "var(--surface-2)" : undefined,
                        color: "var(--text-default)",
                      }}>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden>{flagEmoji(b.country)}</span>
                      <span>{b.country}</span>
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {b.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
