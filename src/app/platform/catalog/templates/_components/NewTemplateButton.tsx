"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { upsertIndustryTemplate } from "@/app/actions/platform-industry-templates";
import { KIND_LABEL } from "./shared";
import type { IndustryTemplateKind } from "@prisma/client";

const KINDS = Object.keys(KIND_LABEL) as IndustryTemplateKind[];

const STARTER_BODIES: Record<IndustryTemplateKind, string> = {
  STOREFRONT: `<section><h1>{{tenant.name}}</h1><p>Welcome — we make {{job.title}} happen.</p></section>`,
  QUOTE_PDF: `<h1>Quote {{job.number}}</h1><p>For {{customer.name}} ({{customer.email}})</p><p>Total: {{job.total}}</p>`,
  WORK_ORDER: `<h1>Work Order {{job.number}}</h1><p>Due: {{job.dueDate}}</p><ul>{{job.lineItems}}</ul>`,
  INVOICE: `<h1>Invoice {{job.number}}</h1><p>{{customer.name}}</p><p>Subtotal: {{job.subtotal}}<br>Tax: {{job.tax}}<br>Total: {{job.total}}</p>`,
  PROOF_EMAIL: `<p>Hi {{customer.contactName}},</p><p>Your proof for {{job.title}} is ready: <a href="{{proof.url}}">view proof</a></p>`,
  CUSTOMER_EMAIL: `<p>Hi {{customer.contactName}},</p><p>Update on {{job.title}}: {{job.status}}.</p>`,
};

export function NewTemplateButton({
  defaultKind,
}: {
  defaultKind: IndustryTemplateKind;
}) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<IndustryTemplateKind>(defaultKind);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New template</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New industry template"
          description="Drafts a new template with a starter body. Open the editor to refine the HTML and add variables."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newTemplateForm"
                action={upsertIndustryTemplate}
                className="flex flex-col gap-4">
            <Input label="Name" name="name" required maxLength={120}
                   placeholder="e.g. Default Quote PDF" />
            <Input label="Slug" name="slug" required maxLength={80}
                   placeholder="default-quote-pdf"
                   hint="Lowercase letters, digits, hyphens or underscores." />
            <Select label="Kind" name="kind" required value={kind}
                    onChange={(e) => setKind(e.target.value as IndustryTemplateKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </Select>
            <Input label="Locale" name="locale" defaultValue="en" maxLength={10}
                   hint="ISO locale — multi-language support is deferred." />
            <Textarea label="Starter body" name="bodyHtml" rows={5}
                      defaultValue={STARTER_BODIES[kind]} />
            <input type="hidden" name="status" value="DRAFT" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newTemplateForm">
            Create draft
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
