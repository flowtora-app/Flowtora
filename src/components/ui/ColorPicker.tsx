"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// ColorPicker — Spec Page 0 §0.5.13.
//
// Trigger: swatch button (24×24) + hex input.
// Popover: hue slider, lightness/saturation tweaks via SV pad,
// hex input, RGB readout, recent colors row.
//
// Eyedropper API (browser-supported via window.EyeDropper) is wired
// when available.

interface RGB { r: number; g: number; b: number; }
interface HSV { h: number; s: number; v: number; }

function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xFF, g: (v >> 8) & 0xFF, b: v & 0xFF };
}
function rgbToHex({ r, g, b }: RGB): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const h6 = h / 60;
  const x = c * (1 - Math.abs((h6 % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (0 <= h6 && h6 < 1) { r = c; g = x; b = 0; }
  else if (1 <= h6 && h6 < 2) { r = x; g = c; b = 0; }
  else if (2 <= h6 && h6 < 3) { r = 0; g = c; b = x; }
  else if (3 <= h6 && h6 < 4) { r = 0; g = x; b = c; }
  else if (4 <= h6 && h6 < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const m = v - c;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export interface ColorPickerProps {
  /** Hex string with or without leading "#". */
  value: string;
  onChange: (hex: string) => void;
  /** Recently used colors row (caller-managed). */
  recent?: string[];
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function ColorPicker({ value, onChange, recent, label, className, disabled }: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const rgb = parseHex(value) ?? { r: 0, g: 0, b: 0 };
  const hsv = rgbToHsv(rgb);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const setHsv = (next: HSV) => onChange(rgbToHex(hsvToRgb(next)));

  const eyedropper = async () => {
    interface EyeDropperApi { open(): Promise<{ sRGBHex: string }>; }
    const ED = (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      onChange(res.sRGBHex.toUpperCase());
    } catch {
      // user canceled
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{label}</label>}
      <div ref={ref} className="relative inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-label="Pick color"
          className="ts-focus inline-block h-6 w-6 rounded-md border disabled:cursor-not-allowed"
          style={{ background: value, borderColor: "var(--border-default)" }}
        />
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value;
            if (parseHex(v)) onChange(v);
            else onChange(v);
          }}
          disabled={disabled}
          className="ts-focus h-7 w-24 rounded-md border bg-transparent px-2 font-mono text-[12px] outline-none"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
        />
        {open && (
          <div
            className="absolute left-0 top-full z-[var(--z-dropdown,100)] mt-2 w-56 rounded-lg border p-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
          >
            <SVPad hsv={hsv} onChange={setHsv} />
            <div className="mt-3">
              <HueSlider hue={hsv.h} onChange={(h) => setHsv({ ...hsv, h })} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <div><div className="font-mono" style={{ color: "var(--text-default)" }}>{rgb.r}</div>R</div>
              <div><div className="font-mono" style={{ color: "var(--text-default)" }}>{rgb.g}</div>G</div>
              <div><div className="font-mono" style={{ color: "var(--text-default)" }}>{rgb.b}</div>B</div>
            </div>
            {recent && recent.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Recent</div>
                <div className="flex flex-wrap gap-1">
                  {recent.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChange(c)}
                      aria-label={c}
                      className="ts-focus h-5 w-5 rounded border"
                      style={{ background: c, borderColor: "var(--border-default)" }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={eyedropper} className="ts-focus text-[11px] font-medium" style={{ color: "var(--accent-primary)" }}>
                Eyedropper
              </button>
              <button type="button" onClick={() => setOpen(false)} className="ts-focus text-[11px] font-medium" style={{ color: "var(--text-default)" }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SVPad({ hsv, onChange }: { hsv: HSV; onChange: (next: HSV) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const update = (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange({ h: hsv.h, s: x, v: 1 - y });
  };
  return (
    <div
      ref={ref}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (e.buttons === 1) update(e); }}
      className="relative h-32 w-full cursor-crosshair overflow-hidden rounded-md"
      style={{
        background: `
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))
        `,
      }}
    >
      <span
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const update = (e: React.MouseEvent | React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(x * 360);
  };
  return (
    <div
      ref={ref}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (e.buttons === 1) update(e); }}
      className="relative h-3 w-full cursor-pointer rounded-full"
      style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{ left: `${(hue / 360) * 100}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}
      />
    </div>
  );
}
