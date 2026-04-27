"use client";

import * as React from "react";
import { uploadUserAvatar } from "@/app/actions/uploads";

// Avatar picker — uploads to R2 immediately on file selection and
// writes the resulting public URL into a hidden `image` input so the
// outer profile form picks it up on submit.
//
// Mirrors the LogoUploader pattern; small tweaks:
//   - circular preview matching how avatars render elsewhere
//   - single-source initials fallback when no avatar is set

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string };

export function AvatarUploader({
  slug,
  initialUrl,
  initials,
}: {
  slug: string;
  initialUrl: string | null;
  initials: string;
}) {
  const [url, setUrl] = React.useState<string | null>(initialUrl);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onPick = async (file: File) => {
    setStatus({ kind: "uploading" });
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadUserAvatar(slug, fd);
    if (result.ok) {
      setUrl(result.url);
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  };

  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
        Avatar
      </label>

      <input type="hidden" name="image" value={url ?? ""} />

      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Avatar preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs font-medium underline"
              style={{ color: "var(--accent-primary)" }}
            >
              {url ? "Replace" : "Upload"}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => setUrl(null)}
                className="text-xs font-medium underline"
                style={{ color: "var(--danger-fg)" }}
              >
                Remove
              </button>
            )}
          </div>
          {status.kind === "uploading" && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Uploading…
            </span>
          )}
          {status.kind === "error" && (
            <span role="alert" className="text-xs" style={{ color: "var(--danger-fg)" }}>
              {status.message}
            </span>
          )}
          {status.kind === "idle" && (
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              PNG, JPEG, WebP, GIF, or SVG · up to 2 MB
            </span>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
