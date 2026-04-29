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

export { Pagination } from "./Pagination";
export type { PaginationProps } from "./Pagination";

export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";

export { ProgressRing } from "./ProgressRing";
export type { ProgressRingProps } from "./ProgressRing";

export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { CodeBlock } from "./CodeBlock";
export type { CodeBlockProps, CodeLine } from "./CodeBlock";

export { PillFilterChips } from "./PillFilterChips";
export type { PillFilterChipsProps, PillChipOption } from "./PillFilterChips";

export { FilterChip } from "./FilterChip";
export type { FilterChipProps } from "./FilterChip";

export { FilterBar } from "./FilterBar";
export type { FilterBarProps, ActiveFilter } from "./FilterBar";

export { SearchWithSuggestions } from "./SearchWithSuggestions";
export type { SearchWithSuggestionsProps, Suggestion } from "./SearchWithSuggestions";

export { Combobox, MultiCombobox } from "./Combobox";
export type { ComboboxProps, ComboboxOption, MultiComboboxProps } from "./Combobox";

export { DatePicker, DateRangePicker, CalendarMonth } from "./DatePicker";
export type { DatePickerProps, DateRangePickerProps, DateRange } from "./DatePicker";

export { TimePicker } from "./TimePicker";
export type { TimePickerProps, TimeValue } from "./TimePicker";

export { FileUpload } from "./FileUpload";
export type { FileUploadProps, UploadedFile } from "./FileUpload";

export { TagsInput } from "./TagsInput";
export type { TagsInputProps } from "./TagsInput";

export { OtpInput } from "./OtpInput";
export type { OtpInputProps } from "./OtpInput";

export { ColorPicker } from "./ColorPicker";
export type { ColorPickerProps } from "./ColorPicker";

export { Table, TableBulkBar } from "./Table";
export type { TableProps, ColumnDef, TableBulkBarProps, Density, SortDir } from "./Table";

export { ScheduleCalendar } from "./ScheduleCalendar";
export type { ScheduleCalendarProps, ScheduledEvent, CalendarView } from "./ScheduleCalendar";

export {
  LineChartCard,
  AreaChartCard,
  BarChartCard,
  DonutChartCard,
  GaugeChart,
  CHART_PALETTE,
} from "./Charts";
export type {
  LineChartProps,
  AreaChartProps,
  BarChartProps,
  DonutChartProps,
  GaugeChartProps,
} from "./Charts";

export { NotificationCenter } from "./NotificationCenter";
export type { NotificationCenterProps, NotificationItem } from "./NotificationCenter";

export { UserMenu } from "./UserMenu";
export type { UserMenuProps, UserMenuItem, UserMenuSection } from "./UserMenu";

export { TenantSwitcher } from "./TenantSwitcher";
export type { TenantSwitcherProps, TenantOption } from "./TenantSwitcher";

export { CommandPalette } from "./CommandPalette";
export type { CommandPaletteProps, CommandItem } from "./CommandPalette";

export { JsonViewer } from "./JsonViewer";
export type { JsonViewerProps } from "./JsonViewer";

export { DiffViewer } from "./DiffViewer";
export type { DiffViewerProps } from "./DiffViewer";

export { MentionInput } from "./MentionInput";
export type { MentionInputProps, MentionItem, MentionTrigger } from "./MentionInput";

export { RichTextToolbar } from "./RichTextToolbar";
export type { RichTextToolbarProps, RtCommand } from "./RichTextToolbar";

export { MarkdownPreview } from "./MarkdownPreview";
export type { MarkdownPreviewProps } from "./MarkdownPreview";

export { ImageLightbox } from "./ImageLightbox";
export type { ImageLightboxProps, LightboxImage } from "./ImageLightbox";

export { ToastProvider, useToast } from "./Toast";
export type { ToastOptions } from "./Toast";

export {
  PageHeaderSkeleton,
  ListPageSkeleton,
  DetailPageSkeleton,
  DashboardSkeleton,
  FormPageSkeleton,
} from "./LoadingLayouts";
