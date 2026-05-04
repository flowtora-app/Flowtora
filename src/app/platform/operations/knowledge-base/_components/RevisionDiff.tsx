// Page 34 — line-by-line revision diff.
//
// LCS-based diff so the output matches what's in unified-diff
// territory (longest common subsequence of lines, with everything
// outside it marked as removed/added). Pure server function, no
// dependency.

interface DiffLine {
  type: "ctx" | "add" | "rm";
  text: string;
}

function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.replace(/\r\n/g, "\n").split("\n");
  const bLines = b.replace(/\r\n/g, "\n").split("\n");
  const m = aLines.length, n = bLines.length;

  // LCS table — sized (m+1)×(n+1).
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) dp[i]![j] = (dp[i + 1]?.[j + 1] ?? 0) + 1;
      else dp[i]![j] = Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
    }
  }

  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: "ctx", text: aLines[i]! });
      i++; j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      out.push({ type: "rm", text: aLines[i]! });
      i++;
    } else {
      out.push({ type: "add", text: bLines[j]! });
      j++;
    }
  }
  while (i < m) { out.push({ type: "rm", text: aLines[i++]! }); }
  while (j < n) { out.push({ type: "add", text: bLines[j++]! }); }
  return out;
}

export function renderDiff(a: string, b: string): React.ReactNode {
  const lines = diffLines(a, b);
  if (lines.length === 0) {
    return (
      <p className="py-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        No textual differences.
      </p>
    );
  }
  // Collapse long unchanged runs to "..." with a hover-expand affordance is a future polish;
  // for now we render every line so the diff is faithful.
  return (
    <pre
      className="overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {lines.map((l, idx) => {
        const palette =
          l.type === "add" ? { bg: "var(--success-surface)", fg: "var(--success-fg)", marker: "+" } :
          l.type === "rm"  ? { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)", marker: "−" } :
                              { bg: "transparent", fg: "var(--text-muted)", marker: " " };
        return (
          <div
            key={idx}
            style={{
              background: palette.bg,
              color: palette.fg,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            <span aria-hidden style={{ display: "inline-block", width: 14, color: palette.fg }}>
              {palette.marker}
            </span>
            {l.text || " "}
          </div>
        );
      })}
    </pre>
  );
}
