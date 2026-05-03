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
import { upsertPricingFormula } from "@/app/actions/platform-pricing-formulas";
import { CATEGORY_LABEL } from "./shared";
import type { PricingFormulaCategory } from "@prisma/client";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as PricingFormulaCategory[];

const STARTER_VARIABLES = `[
  { "key": "qty", "type": "number", "label": "Quantity", "default": 1, "min": 1 }
]`;

const STARTER_CONSTANTS = `[
  { "key": "markup", "value": 0.6, "label": "Markup (60%)" }
]`;

export function NewFormulaButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New formula</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New pricing formula"
          description="Mints a draft. Open the editor to fill in the expression and run the tester before publishing."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newFormulaForm"
                action={upsertPricingFormula}
                className="flex flex-col gap-4">
            <Input label="Name" name="name" required maxLength={120}
                   placeholder="e.g. Banner SqFt" />
            <Input label="Slug" name="slug" required maxLength={80}
                   placeholder="banner-sqft"
                   hint="Lowercase letters, digits, hyphens or underscores." />
            <Select label="Category" name="category" required defaultValue="SQ_FT">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
            <Textarea label="Expression *" name="expression" rows={4} required
                      defaultValue="qty * 10"
                      placeholder="qty * unitPrice * (1 + markup)" />
            <input type="hidden" name="variablesJson" value={STARTER_VARIABLES} />
            <input type="hidden" name="constantsJson" value={STARTER_CONSTANTS} />
            <input type="hidden" name="status" value="DRAFT" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newFormulaForm">
            Create draft
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
