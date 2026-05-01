"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  useToast,
} from "@/components/ui";
import { applyCouponToSubscription } from "@/app/actions/platform-subscriptions";

export function CouponCard({
  tenantId,
  currentCouponId,
  coupons,
}: {
  tenantId: string;
  currentCouponId: string | null;
  coupons: { id: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [couponId, setCouponId] = React.useState(currentCouponId ?? "");
  const [pending, setPending] = React.useState(false);

  const onApply = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      if (couponId) fd.set("couponId", couponId);
      const res = await applyCouponToSubscription(fd);
      if (res.ok) {
        toast.success(couponId ? "Coupon applied" : "Coupon cleared");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't apply");
    } finally { setPending(false); }
  };

  return (
    <Card id="coupon">
      <CardHeader title="Discounts & credits"
                  description="One coupon at a time — applies to the next invoice issued." />
      <CardBody>
        <div className="flex flex-col gap-3">
          <Select label="Coupon" value={couponId} onChange={(e) => setCouponId(e.target.value)}>
            <option value="">— None —</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            {currentCouponId && (
              <Button size="sm" variant="ghost"
                      onClick={() => { setCouponId(""); onApply(); }}
                      disabled={pending}>
                Clear coupon
              </Button>
            )}
            <Button size="sm" onClick={onApply} disabled={pending || (couponId === (currentCouponId ?? ""))}>
              {pending ? "Applying…" : couponId ? "Apply coupon" : "Save"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
