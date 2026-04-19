"use client";

import * as React from "react";

// Phase 13 — signature capture.
//
// A <canvas> we can draw on with mouse/finger/pen, plus a hidden input
// whose value is the PNG data URL of the current strokes. When the user
// submits the surrounding form, the data URL gets posted.
//
// Intentionally tiny: no dependency, no complex transforms. If this ever
// needs pressure sensitivity or vector export, swap in signature_pad the
// library.

export function SignaturePad({
  name,
  height = 180,
  onChange,
  disabled,
}: {
  name: string;
  height?: number;
  onChange?: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hasInk, setHasInk] = React.useState(false);
  const [value, setValue] = React.useState("");

  // Resize the drawing buffer so strokes stay crisp on HiDPI screens.
  const setupCanvas = React.useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement!;
    const cssWidth  = parent.clientWidth;
    const cssHeight = height;
    const dpr = window.devicePixelRatio || 1;
    c.style.width = cssWidth + "px";
    c.style.height = cssHeight + "px";
    c.width  = Math.round(cssWidth * dpr);
    c.height = Math.round(cssHeight * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Theme-safe: draw in a color that contrasts on both light and dark.
    // Using currentColor isn't available on canvas — we just force black,
    // since signatures are shown on a near-white background regardless of
    // app theme.
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap  = "round";
  }, [height]);

  React.useEffect(() => {
    setupCanvas();
    const onResize = () => {
      // Re-initialise on resize. We lose any ink — rare enough to accept.
      setupCanvas();
      setHasInk(false);
      setValue("");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setupCanvas]);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startRef = React.useRef(false);
  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d")!;
    const { x, y } = pointer(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    startRef.current = true;
    if (!hasInk) setHasInk(true);
  };
  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!startRef.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const { x, y } = pointer(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const handleUp = () => {
    if (!startRef.current) return;
    startRef.current = false;
    const c = canvasRef.current!;
    // Encode to data URL and stash in the hidden input / local state.
    const dataUrl = c.toDataURL("image/png");
    setValue(dataUrl);
    onChange?.(dataUrl);
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    setupCanvas();
    setHasInk(false);
    setValue("");
    onChange?.("");
  };

  return (
    <div>
      <div
        className="rounded-md"
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-subtle)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
          style={{
            display: "block",
            touchAction: "none",
            cursor: disabled ? "not-allowed" : "crosshair",
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {!hasInk && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: "#9ca3af" }}
          >
            Sign here
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{hasInk ? "Ready to save" : "No signature yet"}</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="rounded-md px-2 py-1 text-xs"
          style={{
            border: "1px solid var(--border-subtle)",
            color: hasInk ? "var(--text-default)" : "var(--text-muted)",
            opacity: hasInk ? 1 : 0.5,
          }}
        >
          Clear
        </button>
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
