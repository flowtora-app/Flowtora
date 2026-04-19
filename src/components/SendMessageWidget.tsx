"use client";

import * as React from "react";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { renderTemplate, type TemplateBag } from "@/lib/message-templates";
import { sendMessageTemplate } from "@/app/actions/message-templates";

// Phase 14 Slice D — composable "Send update" widget.
//
// Mounted on the customer / quote / order / install detail pages. Gives the
// staff member a template picker, a live preview of the subject + body with
// variables substituted, and an optional edit-before-send step. The preview
// happens client-side so you don't submit-and-reload between "pick template"
// and "see what it'll look like".

export type SendMessageWidgetTemplate = {
  id:      string;
  name:    string;
  subject: string;
  body:    string;
};

type Props = {
  slug: string;
  customerId: string;
  customerEmail: string | null;
  quoteId?:        string;
  orderId?:        string;
  installEventId?: string;
  returnTo?: string;
  templates: SendMessageWidgetTemplate[];
  bag: TemplateBag;
};

export function SendMessageWidget({
  slug: _slug,
  customerId,
  customerEmail,
  quoteId,
  orderId,
  installEventId,
  returnTo,
  templates,
  bag,
}: Props) {
  const [templateId, setTemplateId] = React.useState<string>(templates[0]?.id ?? "");
  const selected = templates.find((t) => t.id === templateId);

  // Subject/body start as the rendered template, and become free-form from
  // there. Re-selecting a template reseeds them.
  const [subject, setSubject] = React.useState<string>(
    selected ? renderTemplate(selected.subject, bag) : "",
  );
  const [body, setBody] = React.useState<string>(
    selected ? renderTemplate(selected.body, bag) : "",
  );
  const [toAddress, setToAddress] = React.useState<string>(customerEmail ?? "");

  function pick(nextId: string) {
    setTemplateId(nextId);
    const t = templates.find((x) => x.id === nextId);
    if (t) {
      setSubject(renderTemplate(t.subject, bag));
      setBody(renderTemplate(t.body, bag));
    } else {
      setSubject("");
      setBody("");
    }
  }

  if (templates.length === 0) {
    return (
      <div className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
        No active templates for this context yet. Create one in{" "}
        <a href={`/t/${_slug}/settings/message-templates`} className="underline">
          Settings → Messages
        </a>
        .
      </div>
    );
  }

  return (
    <form action={sendMessageTemplate.bind(null, _slug)} className="space-y-3 px-5 py-4">
      <input type="hidden" name="customerId" value={customerId} />
      {quoteId        && <input type="hidden" name="quoteId" value={quoteId} />}
      {orderId        && <input type="hidden" name="orderId" value={orderId} />}
      {installEventId && <input type="hidden" name="installEventId" value={installEventId} />}
      {returnTo       && <input type="hidden" name="returnTo" value={returnTo} />}

      <SelectField
        label="Template"
        name="templateId"
        value={templateId}
        onChange={(e) => pick(e.target.value)}
        options={templates.map((t) => ({ value: t.id, label: t.name }))}
      />

      <Field
        label="To"
        name="toAddress"
        type="email"
        value={toAddress}
        onChange={(e) => setToAddress(e.target.value)}
        required
      />

      <Field
        label="Subject"
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        required
      />

      <TextArea
        label="Body"
        name="body"
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Recorded on the customer timeline. (No live mail until Phase 16.)
        </span>
        <Button type="submit" disabled={!toAddress || !subject || !body}>Record send</Button>
      </div>
    </form>
  );
}
