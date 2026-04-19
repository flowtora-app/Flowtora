"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
} from "@/components/ui";

// Tiny client wrapper so the server-rendered showcase page can demo the
// Dialog without becoming a client component itself. Isolating state to
// this trigger also lets the rest of the page stay fully static.

export function DialogTrigger() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Open example dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="Delete tenant"
          description="This will schedule the tenant for deletion in 30 days. The action is reversible until then."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <Input
            label="Type the tenant slug to confirm"
            placeholder="acme-signs"
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={() => setOpen(false)}>
            Schedule deletion
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
