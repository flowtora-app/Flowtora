"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// ImageLightbox — Spec Page 0 §0.5.58.
//
// Lightbox: full-screen overlay, prev/next, zoom, rotate, download,
// copy link, fit/actual, keyboard nav.
// Inline: thumbnail with hover zoom (omitted here — caller renders
// any thumbnail and triggers the lightbox manually).

export interface LightboxImage {
  id: string;
  src: string;
  alt?: string;
  /** Optional caption rendered under the image. */
  caption?: React.ReactNode;
  /** Override download filename. */
  downloadAs?: string;
}

export interface ImageLightboxProps {
  images: LightboxImage[];
  /** Index of the image currently open. -1 = closed. */
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  className?: string;
}

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  className,
}: ImageLightboxProps) {
  const [zoom, setZoom] = React.useState(1);
  const [rot, setRot] = React.useState(0);
  const [actual, setActual] = React.useState(false);

  const open = index >= 0 && index < images.length;
  const img = open ? images[index]! : null;

  // Reset zoom/rotation when navigating.
  React.useEffect(() => { setZoom(1); setRot(0); setActual(false); }, [index]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndexChange(Math.min(images.length - 1, index + 1));
      else if (e.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.25));
      else if (e.key === "-") setZoom((z) => Math.max(0.25, z - 0.25));
      else if (e.key.toLowerCase() === "r") setRot((r) => (r + 90) % 360);
      else if (e.key.toLowerCase() === "f") setActual((a) => !a);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onClose, onIndexChange]);

  if (!open || !img) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className={cn("fixed inset-0 z-[var(--z-modal,900)] flex flex-col", className)}
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
          <span className="tabular-nums">{index + 1} / {images.length}</span>
          {img.alt && <span style={{ color: "rgba(255,255,255,0.6)" }}>· {img.alt}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Btn onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} aria-label="Zoom out">−</Btn>
          <span className="px-1 text-[11px] tabular-nums" style={{ color: "rgba(255,255,255,0.85)" }}>{Math.round(zoom * 100)}%</span>
          <Btn onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">+</Btn>
          <Btn onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Rotate">↻</Btn>
          <Btn onClick={() => setActual((a) => !a)} aria-pressed={actual} aria-label="Actual size">{actual ? "Fit" : "1:1"}</Btn>
          <Btn onClick={() => downloadImage(img)} aria-label="Download">↓</Btn>
          <Btn onClick={() => copyLink(img.src)} aria-label="Copy link">⎘</Btn>
          <Btn onClick={onClose} aria-label="Close">×</Btn>
        </div>
      </div>

      {/* Body */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {index > 0 && (
          <NavBtn side="left" onClick={() => onIndexChange(index - 1)} />
        )}
        <div
          style={{
            transform: `scale(${zoom}) rotate(${rot}deg)`,
            transition: "transform 200ms ease-out",
            display: "inline-block",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.alt ?? ""}
            style={{
              display: "block",
              maxWidth: actual ? undefined : "min(88vw, 1600px)",
              maxHeight: actual ? undefined : "78vh",
            }}
          />
        </div>
        {index < images.length - 1 && (
          <NavBtn side="right" onClick={() => onIndexChange(index + 1)} />
        )}
      </div>

      {/* Caption */}
      {img.caption && (
        <div
          className="border-t border-white/10 px-4 py-2 text-center text-[12px]"
          style={{ color: "rgba(255,255,255,0.8)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {img.caption}
        </div>
      )}
    </div>
  );
}

function Btn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="ts-focus inline-flex h-7 min-w-[28px] items-center justify-center rounded-md text-[12px]"
      style={{ background: "transparent", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.18)" }}
    >
      {children}
    </button>
  );
}

function NavBtn({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous image" : "Next image"}
      className="ts-focus absolute top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full text-[20px]"
      style={{
        [side]: 16,
        background: "rgba(0,0,0,0.5)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.18)",
      } as React.CSSProperties}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

async function copyLink(src: string) {
  try {
    await navigator.clipboard.writeText(src);
  } catch {
    // ignore — caller could show a toast on failure if needed
  }
}

function downloadImage(img: LightboxImage) {
  const a = document.createElement("a");
  a.href = img.src;
  a.download = img.downloadAs ?? img.alt ?? "image";
  a.target = "_blank";
  a.rel = "noreferrer";
  a.click();
}
