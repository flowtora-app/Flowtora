import { ImageResponse } from "next/og";

// Phase 23 — generated favicon.
//
// Next.js' file-based icon convention: this file is picked up as /icon and
// served as the favicon. A Node-rendered SVG wordmark "T" on the brand
// accent, so browser tabs stop 404ing on /favicon.ico.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          "100%",
          height:         "100%",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          background:     "#0ea5e9",
          color:          "#fff",
          fontSize:       22,
          fontWeight:     700,
          fontFamily:     "system-ui, sans-serif",
          letterSpacing:  -0.5,
          borderRadius:   6,
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
