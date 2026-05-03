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
import { upsertMasterMaterial } from "@/app/actions/platform-materials";
import { CATEGORY_LABEL } from "./shared";
import type { MasterMaterialCategory } from "@prisma/client";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MasterMaterialCategory[];

export function NewMaterialButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New material</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New master material"
          description="Mints a new material at default values. Open the editor to fill in suppliers + swatches + cost details."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newMaterialForm"
                action={upsertMasterMaterial}
                className="flex flex-col gap-4">
            <Input label="Name" name="name" required maxLength={120}
                   placeholder="e.g. 13oz Scrim Vinyl" />
            <Input label="Slug" name="slug" required maxLength={80}
                   placeholder="vinyl-13oz-scrim"
                   hint="Lowercase letters, digits, hyphens or underscores." />
            <Input label="SKU" name="sku" maxLength={60}
                   placeholder="Optional internal SKU" />
            <Select label="Category" name="category" required defaultValue="VINYL">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
            <Input label="Subcategory" name="subcategory" maxLength={60}
                   placeholder="e.g. Cast / Calendared / Reflective" />
            <Input label="Default unit" name="defaultUnit" defaultValue="sq_ft"
                   hint="sq_ft / sq_m / yard / lb / each / linear_ft" />
            <Input label="Default cost (cents)" name="defaultCost" type="number"
                   defaultValue="0" />
            <input type="hidden" name="usage" value="BOTH" />
            <input type="hidden" name="defaultMarkupPct" value="50" />
            <input type="hidden" name="wasteFactorPct" value="0" />
            <input type="hidden" name="status" value="ACTIVE" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newMaterialForm">
            Create material
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
