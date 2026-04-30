"use client";

import * as React from "react";
import Link from "next/link";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { flagEmoji } from "@/lib/country-codes";
import type { GeoCountryRow, GeoDistribution } from "@/server/platform/overview-metrics";

// TenantWorldMap — Page 1 §Row 7 right.
//
// Choropleth of tenant *count* (cell colour) + bubble overlay sized
// by *MRR* (bubble radius). Hover any country to read the country
// card on the right rail; click → /platform/tenants?country=ISO.
//
// Uses the same world-atlas-110m TopoJSON our LiveMap already proved
// out — ~30KB, hard-cached by jsdelivr, no API key.

const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// 5-bucket sequential brand ramp for the choropleth. Bucket 0 = no
// tenants in country (use surface-3 so it reads as "empty"), then
// 1–4+ ramp from light brand to dark.
const COUNT_RAMP = [
  "var(--surface-3)",
  "var(--brand-100)",
  "var(--brand-300)",
  "var(--brand-500)",
  "var(--brand-700)",
] as const;

export interface TenantWorldMapProps {
  data: GeoDistribution;
  height?: number;
}

interface MapFeature {
  rsmKey: string;
  id: string;
  properties?: { name?: string };
}

export function TenantWorldMap({ data, height = 360 }: TenantWorldMapProps) {
  const [hover, setHover] = React.useState<GeoCountryRow | null>(null);
  const byIsoNum = React.useMemo(
    () => new Map(data.countries.map((c) => [c.isoNum, c])),
    [data.countries],
  );

  const maxMrr = Math.max(1, ...data.countries.map((c) => c.mrr));
  // Bucket countries by tenant count for the ramp.
  const bucket = (count: number) => {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 9) return 3;
    return 4;
  };

  const totalCountries = data.countries.length;
  const totalTenants   = data.countries.reduce((s, c) => s + c.count, 0) + data.unknown.count;
  const totalMrr       = data.countries.reduce((s, c) => s + c.mrr, 0) + data.unknown.mrr;

  return (
    <Card padding="md" className="h-full">
      <CardHeader
        title="Geographic distribution"
        description={`${totalTenants.toLocaleString()} tenants across ${totalCountries} countries · $${totalMrr.toLocaleString()} MRR`}
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
          {/* Map */}
          <div
            className="relative w-full overflow-hidden rounded-lg"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              height,
            }}
            onMouseLeave={() => setHover(null)}
          >
            <ComposableMap
              projection="geoEqualEarth"
              projectionConfig={{ scale: 155 }}
              style={{ width: "100%", height: "100%" }}
            >
              <Geographies geography={TOPO_URL}>
                {({ geographies }: { geographies: MapFeature[] }) =>
                  geographies.map((geo) => {
                    const row = byIsoNum.get(geo.id);
                    const fill = COUNT_RAMP[bucket(row?.count ?? 0)];
                    const isHovered = hover?.iso2 === row?.iso2;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="var(--border-subtle)"
                        strokeWidth={0.4}
                        onMouseEnter={() => row && setHover(row)}
                        style={{
                          default: { outline: "none", transition: "fill 120ms" },
                          hover:   { outline: "none", fill: row ? "var(--brand-600)" : "var(--surface-2)" },
                          pressed: { outline: "none" },
                        }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {...({ "data-active": isHovered ? "true" : "false" } as any)}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Bubble overlay — radius prop to MRR.
                  We have to map iso → centroid via the geographies
                  render; cheaper to pre-compute by re-using the same
                  Geographies block with a second pass. */}
              <Geographies geography={TOPO_URL}>
                {({ geographies }: { geographies: MapFeature[] }) =>
                  geographies.map((geo) => {
                    const row = byIsoNum.get(geo.id);
                    if (!row || row.mrr <= 0) return null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const centroid = geoCentroid(geo as any) as [number, number];
                    if (!centroid || Number.isNaN(centroid[0])) return null;
                    const r = bubbleRadius(row.mrr, maxMrr);
                    return (
                      <Marker key={`bub-${geo.rsmKey}`} coordinates={centroid}>
                        <circle
                          r={r}
                          fill="var(--accent-primary)"
                          fillOpacity={0.35}
                          stroke="var(--brand-700)"
                          strokeWidth={0.6}
                          onMouseEnter={() => setHover(row)}
                          style={{ cursor: "pointer" }}
                        >
                          <title>{`${row.name}: ${row.count} tenants · $${row.mrr.toLocaleString()} MRR`}</title>
                        </circle>
                      </Marker>
                    );
                  })
                }
              </Geographies>
            </ComposableMap>

            {/* Choropleth legend */}
            <div
              className="absolute left-3 bottom-3 flex items-center gap-2 rounded-md border px-2 py-1"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Tenants
              </span>
              {COUNT_RAMP.slice(1).map((c, i) => (
                <span
                  key={c}
                  className="inline-block h-3 w-4 rounded-sm"
                  style={{ background: c, border: "1px solid var(--border-subtle)" }}
                  title={["1", "2–3", "4–9", "10+"][i]}
                />
              ))}
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>1 → 10+</span>
            </div>
          </div>

          {/* Right-rail country card */}
          <CountrySideCard country={hover} fallback={data.countries.slice(0, 5)} unknown={data.unknown} />
        </div>
      </CardBody>
    </Card>
  );
}

function bubbleRadius(mrr: number, maxMrr: number): number {
  // Square-root scale so a 100x revenue country isn't 100x area.
  if (mrr <= 0) return 0;
  const minR = 3;
  const maxR = 14;
  const t = Math.sqrt(mrr / maxMrr);
  return minR + t * (maxR - minR);
}

/* ── Right rail ───────────────────────────────────────────── */

function CountrySideCard({
  country,
  fallback,
  unknown,
}: {
  country: GeoCountryRow | null;
  fallback: GeoCountryRow[];
  unknown: GeoDistribution["unknown"];
}) {
  if (country) {
    return (
      <div
        className="rounded-lg border p-3"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none" aria-hidden>{flagEmoji(country.iso2)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{country.name}</div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{country.iso2} · {country.count} tenants</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Tenants" value={country.count.toLocaleString()} />
          <Stat label="MRR"     value={"$" + country.mrr.toLocaleString()} />
        </div>
        {country.topTenants.length > 0 && (
          <>
            <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Top tenants
            </div>
            <ul className="flex flex-col gap-1">
              {country.topTenants.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <Link
                    href={`/platform/tenants/${t.id}`}
                    className="min-w-0 truncate hover:underline"
                    style={{ color: "var(--text-default)" }}
                  >
                    {t.name}
                  </Link>
                  <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                    ${t.mrr.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-3">
          <Link
            href={`/platform/tenants?country=${country.iso2}`}
            className="text-[12px] font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            View all in {country.name} →
          </Link>
        </div>
      </div>
    );
  }

  // Idle state — top-5 leaderboard so the rail isn't blank.
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        Top countries
      </div>
      {fallback.length === 0 ? (
        <div className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          No tenants with a recognised country yet.
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {fallback.map((c) => (
            <li key={c.iso2} className="flex items-center gap-2 text-[12px]">
              <span aria-hidden>{flagEmoji(c.iso2)}</span>
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-default)" }}>{c.name}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>{c.count}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--text-faint)" }}>
                ${(c.mrr / 1000).toFixed(c.mrr >= 10_000 ? 0 : 1)}k
              </span>
            </li>
          ))}
        </ul>
      )}
      {unknown.count > 0 && (
        <div className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
          + {unknown.count} tenant{unknown.count === 1 ? "" : "s"} with no recognised country
        </div>
      )}
      <div className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Hover a country to see details.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
    </div>
  );
}
