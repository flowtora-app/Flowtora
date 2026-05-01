"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  promoteShadowToActive,
  saveScoringModel,
  setShadowModel,
} from "@/app/actions/health-scoring";
import type {
  ActiveModel,
  HealthFactor,
  HealthFactorKey,
} from "@/server/platform/health-scoring";

// ScoringModelEditorButton — opens a multi-section dialog where
// admins can:
//   • Adjust per-factor weights via sliders that auto-balance to 100
//   • Save as the new active model (or as a shadow / A/B candidate)
//   • Browse version history + promote a previous version
//   • Promote the current shadow → active

type Mode = "active" | "shadow";

export function ScoringModelEditorButton({
  factors,
  active,
  shadow,
  history,
}: {
  factors: HealthFactor[];
  active: ActiveModel;
  shadow: ActiveModel | null;
  history: ActiveModel[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = React.useState(`v${active.version + 1} — tweak`);
  const [description, setDescription] = React.useState("");
  const [formula, setFormula] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("active");
  const [weights, setWeights] = React.useState<Record<HealthFactorKey, number>>(
    () => ({ ...active.weights }),
  );
  const [tab, setTab] = React.useState<"weights" | "history">("weights");
  const [pending, setPending] = React.useState(false);

  const reset = () => {
    setName(`v${active.version + 1} — tweak`);
    setDescription("");
    setFormula("");
    setMode("active");
    setWeights({ ...active.weights });
    setTab("weights");
  };
  const onOpen = () => { reset(); setOpen(true); };

  const sum = factors.reduce((acc, f) => acc + (weights[f.key] ?? 0), 0);
  const sumOk = Math.round(sum) === 100;

  const setWeight = (k: HealthFactorKey, v: number) => {
    setWeights((prev) => ({ ...prev, [k]: Math.max(0, Math.min(100, Math.round(v))) }));
  };
  const normaliseToHundred = () => {
    const s = sum;
    if (s === 0) return;
    setWeights((prev) => {
      const next = { ...prev };
      let running = 0;
      const keys = factors.map((f) => f.key);
      keys.forEach((k, i) => {
        if (i === keys.length - 1) {
          next[k] = Math.max(0, 100 - running);
        } else {
          const scaled = Math.round((prev[k] ?? 0) * (100 / s));
          next[k] = Math.max(0, scaled);
          running += scaled;
        }
      });
      return next;
    });
  };
  const resetToActive = () => setWeights({ ...active.weights });
  const resetToDefaults = () => {
    const next: Record<HealthFactorKey, number> = { ...weights };
    for (const f of factors) next[f.key] = f.defaultWeight;
    setWeights(next);
  };

  const onSubmit = async () => {
    if (!sumOk) { toast.error(`Weights must sum to 100 (got ${Math.round(sum)})`); return; }
    if (!name.trim()) { toast.error("Name is required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (description.trim()) fd.set("description", description.trim());
      fd.set("weightsJson", JSON.stringify(weights));
      if (formula.trim()) fd.set("formula", formula.trim());
      fd.set("mode", mode);
      const res = await saveScoringModel(fd);
      if (res.ok) {
        toast.success(mode === "active" ? "Activated new model" : "Saved as shadow");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error ?? "Couldn't save");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setPending(false);
    }
  };

  const onPromote = async (modelId: string) => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("modelId", modelId);
      const res = await promoteShadowToActive(fd);
      if (res.ok) {
        toast.success("Promoted to active");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error ?? "Couldn't promote");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't promote");
    } finally {
      setPending(false);
    }
  };

  const onClearShadow = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      const res = await setShadowModel(fd);
      if (res.ok) {
        toast.success("Cleared shadow");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't clear");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't clear");
    } finally {
      setPending(false);
    }
  };

  const onSetShadow = async (modelId: string) => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("modelId", modelId);
      const res = await setShadowModel(fd);
      if (res.ok) {
        toast.success("Set as shadow");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't set");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't set");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={onOpen}>Edit scoring model</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="xl">
        <DialogHeader
          title="Edit scoring model"
          description={`Active: v${active.version} · ${shadow ? `Shadow: v${shadow.version}` : "No shadow"}`}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <div className="mb-3 flex gap-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <TabButton active={tab === "weights"} onClick={() => setTab("weights")}>
              Weights
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              Version history ({history.length})
            </TabButton>
          </div>

          {tab === "weights" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Version name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  hint="e.g. v3 — added NPS factor"
                />
                <div>
                  <label className="block text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                    Mode
                  </label>
                  <div className="mt-1 flex gap-2">
                    <ModePill active={mode === "active"} onClick={() => setMode("active")}>
                      Save & activate
                    </ModePill>
                    <ModePill active={mode === "shadow"} onClick={() => setMode("shadow")}>
                      Save as shadow (A/B)
                    </ModePill>
                  </div>
                </div>
              </div>

              <Textarea
                label="Description (optional)"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                hint="What changed and why."
              />
              <Textarea
                label="Formula (optional)"
                rows={2}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                hint="Free-form description of the formula. Pre-filled when blank."
              />

              <div className="rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between border-b px-3 py-2"
                     style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    Factor weights
                  </span>
                  <span className="text-[11px] tabular-nums"
                        style={{ color: sumOk ? "var(--emerald-700)" : "var(--rose-700)" }}>
                    Sum: {Math.round(sum)} / 100
                  </span>
                </div>
                <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {factors.map((f) => (
                    <li key={f.key} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-[160px]">
                        <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                          {f.label}
                          {f.honestStub && (
                            <span title="Signal not yet collected — score returns neutral 50."
                                  className="rounded-full px-1.5 text-[9px] uppercase tracking-wide"
                                  style={{ background: "var(--amber-50)", color: "var(--amber-700)" }}>
                              stub
                            </span>
                          )}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{f.description}</div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={1}
                        value={weights[f.key] ?? 0}
                        onChange={(e) => setWeight(f.key, Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        max={100}
                        value={weights[f.key] ?? 0}
                        onChange={(e) => setWeight(f.key, Number(e.target.value))}
                        containerClassName="w-16"
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="xs" variant="ghost" onClick={normaliseToHundred} disabled={sum === 0}>
                  Normalise to 100
                </Button>
                <Button size="xs" variant="ghost" onClick={resetToActive}>Reset to active</Button>
                <Button size="xs" variant="ghost" onClick={resetToDefaults}>Reset to defaults</Button>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="flex flex-col">
              {shadow && (
                <div className="mb-3 rounded-md border p-3"
                     style={{ borderColor: "var(--border-default)", background: "var(--accent-surface)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                        Current shadow: v{shadow.version} — {shadow.name}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Side-by-side compute is enabled. Promote when you&apos;re happy with it.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="xs" variant="primary" onClick={() => onPromote(shadow.id)} disabled={pending}>
                        Promote → active
                      </Button>
                      <Button size="xs" variant="ghost" onClick={onClearShadow} disabled={pending}>
                        Clear shadow
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {history.length === 0 ? (
                <div className="rounded-md border border-dashed py-12 text-center text-[12px]"
                     style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                  No history yet — first model auto-seeded.
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {history.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                          v{m.version} — {m.name}
                          {m.id === active.id && (
                            <span className="rounded-full px-1.5 text-[10px]"
                                  style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>
                              active
                            </span>
                          )}
                          {m.id === shadow?.id && (
                            <span className="rounded-full px-1.5 text-[10px]"
                                  style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                              shadow
                            </span>
                          )}
                        </div>
                        {m.description && (
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {m.description}
                          </div>
                        )}
                        <div className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                          {m.createdAt.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {m.id !== active.id && (
                          <Button size="xs" variant="secondary" onClick={() => onPromote(m.id)} disabled={pending}>
                            Activate
                          </Button>
                        )}
                        {m.id !== active.id && m.id !== shadow?.id && (
                          <Button size="xs" variant="ghost" onClick={() => onSetShadow(m.id)} disabled={pending}>
                            Use as shadow
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogBody>
        {tab === "weights" && (
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={onSubmit} disabled={pending || !sumOk}>
              {pending ? "Saving…" :
                mode === "active" ? "Save & activate" : "Save as shadow"}
            </Button>
          </DialogFooter>
        )}
      </Dialog>
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus relative px-3 py-1.5 text-[12px] font-medium"
      style={{
        color: active ? "var(--text-default)" : "var(--text-muted)",
        borderBottom: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function ModePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{
        borderColor: active ? "var(--accent-primary)" : "var(--border-default)",
        background: active ? "var(--accent-surface)" : "var(--surface-1)",
        color: active ? "var(--accent-primary)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}
