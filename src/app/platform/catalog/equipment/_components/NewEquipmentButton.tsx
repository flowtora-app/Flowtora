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
import { upsertMasterEquipment } from "@/app/actions/platform-equipment";
import { CATEGORY_LABEL } from "./shared";
import type { MasterEquipmentCategory } from "@prisma/client";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MasterEquipmentCategory[];

export function NewEquipmentButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New equipment</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New equipment template"
          description="Mints a new equipment row at default values. Open the editor to fill in materials + maintenance tasks."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newEquipmentForm"
                action={upsertMasterEquipment}
                className="flex flex-col gap-4">
            <Input label="Brand" name="brand" required maxLength={80}
                   placeholder="e.g. Roland" />
            <Input label="Model" name="model" required maxLength={120}
                   placeholder="e.g. TrueVIS VG3-540" />
            <Input label="Slug" name="slug" required maxLength={80}
                   placeholder="roland-truevis-vg3-540"
                   hint="Lowercase letters, digits, hyphens or underscores." />
            <Select label="Category" name="category" required defaultValue="PRINTER">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
            <input type="hidden" name="warmupMinutes" value="0" />
            <input type="hidden" name="changeoverMinutes" value="0" />
            <input type="hidden" name="defaultUptimePct" value="85" />
            <input type="hidden" name="defaultWastePct" value="5" />
            <input type="hidden" name="purchaseCostMinor" value="0" />
            <input type="hidden" name="depreciationYears" value="7" />
            <input type="hidden" name="hourlyOperatingCostMinor" value="0" />
            <input type="hidden" name="status" value="ACTIVE" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newEquipmentForm">
            Create equipment
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
