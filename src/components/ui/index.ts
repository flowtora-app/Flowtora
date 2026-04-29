// Barrel export for the Phase 18 design system.
//
// Import like:   import { Button, Card, EmptyState } from "@/components/ui";
//
// Each primitive is also importable from its leaf path if tree-shaking
// ever becomes a concern, but the barrel is the preferred entry point.

export { Button } from "./Button";
export type { ButtonProps } from "./Button";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";

export { Select } from "./Select";
export type { SelectProps } from "./Select";

export { Card, CardHeader, CardBody, CardFooter } from "./Card";
export type { CardProps, CardHeaderProps } from "./Card";

export { PageHeader, SectionHeader } from "./PageHeader";
export type { PageHeaderProps, SectionHeaderProps } from "./PageHeader";

export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbProps, BreadcrumbItem } from "./Breadcrumb";

export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";

export { StatusPill } from "./StatusPill";
export type { StatusPillProps } from "./StatusPill";

export { Avatar, AvatarGroup } from "./Avatar";
export type { AvatarProps, AvatarGroupProps } from "./Avatar";

export { Kbd } from "./Kbd";
export type { KbdProps } from "./Kbd";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Skeleton, SkeletonText, SkeletonCard } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";

export { Dialog, DialogHeader, DialogBody, DialogFooter, ConfirmDialog } from "./Dialog";
export type { DialogProps, DialogHeaderProps, DialogFooterProps, ConfirmDialogProps } from "./Dialog";

export { Drawer } from "./Drawer";
export type { DrawerProps } from "./Drawer";

export { Banner } from "./Banner";
export type { BannerProps } from "./Banner";

export { Tabs } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";

export { Accordion, AccordionItem } from "./Accordion";
export type { AccordionProps, AccordionItemProps } from "./Accordion";

export { Stepper } from "./Stepper";
export type { StepperProps, StepperStep, StepState } from "./Stepper";

export { ToastProvider, useToast } from "./Toast";
export type { ToastOptions } from "./Toast";

export {
  PageHeaderSkeleton,
  ListPageSkeleton,
  DetailPageSkeleton,
  DashboardSkeleton,
  FormPageSkeleton,
} from "./LoadingLayouts";
