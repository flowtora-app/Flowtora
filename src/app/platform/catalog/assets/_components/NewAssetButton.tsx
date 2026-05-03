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
import { upsertDesignAsset } from "@/app/actions/platform-design-assets";
import { KIND_LABEL, LICENSE_LABEL } from "./shared";
import type { DesignAssetKind, DesignAssetLicense } from "@prisma/client";

const KINDS = Object.keys(KIND_LABEL) as DesignAssetKind[];
const LICENSES = Object.keys(LICENSE_LABEL) as DesignAssetLicense[];

export function NewAssetButton({
  defaultKind,
}: {
  defaultKind: DesignAssetKind;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New asset</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New design asset"
          description="Mints a new asset row at default values. Open the editor to fill in the file URL, license attribution, and plan gating."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newAssetForm"
                action={upsertDesignAsset}
                className="flex flex-col gap-4">
            <Input label="Name" name="name" required maxLength={120}
                   placeholder="e.g. Inter Variable Font" />
            <Input label="Slug" name="slug" required maxLength={80}
                   placeholder="inter-variable"
                   hint="Lowercase letters, digits, hyphens or underscores." />
            <Select label="Kind" name="kind" required defaultValue={defaultKind}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </Select>
            <Select label="License" name="license" required defaultValue="COMMERCIAL">
              {LICENSES.map((l) => (
                <option key={l} value={l}>{LICENSE_LABEL[l]}</option>
              ))}
            </Select>
            <input type="hidden" name="status" value="ACTIVE" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newAssetForm">
            Create asset
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
