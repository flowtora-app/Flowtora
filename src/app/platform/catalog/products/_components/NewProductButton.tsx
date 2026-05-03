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
} from "@/components/ui";
import { upsertMasterProduct } from "@/app/actions/platform-catalog";
import { CATEGORY_LABEL } from "./shared";
import type { MasterProductCategory } from "@prisma/client";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MasterProductCategory[];

export function NewProductButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New product</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New master product"
          description="Drafts a new template. Open the editor to fill in attributes, pricing, and images before publishing."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newMasterProductForm"
                action={upsertMasterProduct}
                className="flex flex-col gap-4">
            <Input label="Name" name="name" required maxLength={120}
                   placeholder="e.g. 13oz Vinyl Banner" />
            <Input label="Slug" name="slug" required maxLength={80}
                   placeholder="vinyl-banner-13oz"
                   hint="Lowercase letters, digits, and hyphens." />
            <Input label="SKU" name="sku" maxLength={60}
                   placeholder="Optional internal SKU" />
            <Select label="Category" name="category" required defaultValue="BANNERS">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
            <Input label="Short description" name="shortDescription" maxLength={280}
                   placeholder="One-liner shown on cards." />
            <input type="hidden" name="status" value="DRAFT" />
            <input type="hidden" name="leadTimeDays" value="3" />
            <input type="hidden" name="wasteFactorPct" value="0" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newMasterProductForm">
            Create draft
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
