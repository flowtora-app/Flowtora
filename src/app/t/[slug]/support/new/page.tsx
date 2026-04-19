import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, TextArea, Button } from "@/components/Field";
import { openSupportTicket } from "@/app/actions/support";

const CATEGORIES = [
  { value: "QUESTION", label: "Question / how-to" },
  { value: "BUG", label: "Something's broken" },
  { value: "BILLING", label: "Billing" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "OTHER", label: "Other" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low — when you get to it" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High — blocking today" },
  { value: "URGENT", label: "Urgent — shop down" },
];

export default async function NewSupportTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireTenant(slug);

  const submit = openSupportTicket.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          <Link href={`/t/${slug}/support`} className="underline">Support</Link> / New ticket
        </div>
        <h1 className="mt-1 text-2xl font-semibold">Open a ticket</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Describe what's happening. The more context you share up front, the faster we can help.
        </p>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <form action={submit} className="space-y-4 px-5 py-5">
          <Field
            label="Subject"
            name="subject"
            placeholder="e.g. Tax rate not applying on out-of-state quotes"
            required
            maxLength={200}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Category" name="category" options={CATEGORIES} defaultValue="QUESTION" />
            <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue="NORMAL" />
          </div>
          <TextArea
            label="What's happening?"
            name="body"
            rows={10}
            required
            maxLength={8000}
            placeholder={[
              "Walk us through what you were trying to do and what happened instead.",
              "",
              "• Which screen were you on?",
              "• What did you click?",
              "• What did you see (error message, wrong number, blank page)?",
            ].join("\n")}
          />
          <div className="flex items-center justify-end gap-2">
            <Link
              href={`/t/${slug}/support`}
              className="rounded-md px-4 py-2 text-sm"
              style={{ color: "var(--muted)" }}
            >
              Cancel
            </Link>
            <Button type="submit">Submit ticket</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
