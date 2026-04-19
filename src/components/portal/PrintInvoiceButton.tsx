"use client";

// Phase 14 — portal print button.
//
// Tiny client island: the enclosing invoice page is a server component
// so we can't bind onClick there. Triggers the browser's native print
// dialog — modern browsers offer "Save as PDF" as a destination, which
// is what customers typically want.

export function PrintInvoiceButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md px-4 py-2 text-sm font-medium"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        color: "var(--text-default)",
      }}
    >
      Print / save PDF
    </button>
  );
}
