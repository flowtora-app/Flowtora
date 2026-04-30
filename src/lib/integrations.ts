// Master integrations registry — Page 4a §Tab 8.
//
// The list of integrations a tenant *can* connect lives in code; the
// per-tenant connection rows live in the TenantIntegration table.
// Each entry below has display metadata + the canonical scopes you
// can wire when calling our connect-flow (which is itself a future
// slice — today rows are populated manually by platform staff or by
// stripe-webhook-driven backfill).

export type IntegrationCategory =
  | "billing"
  | "ecommerce"
  | "communications"
  | "crm-marketing"
  | "shipping"
  | "tax"
  | "esign"
  | "productivity";

export interface IntegrationDef {
  /** Stable provider key — matches TenantIntegration.provider. */
  key: string;
  name: string;
  category: IntegrationCategory;
  /** One-line blurb shown on the integration card. */
  description: string;
  /** Single emoji used as the card icon. Replace with a proper logo
   *  set later. */
  icon: string;
  /** Free-form scope tags the user can pick when connecting (only
   *  read in the Tab 8 UI today). */
  availableScopes: string[];
}

export const INTEGRATION_REGISTRY: IntegrationDef[] = [
  // Billing
  { key: "stripe",      name: "Stripe",       category: "billing",     description: "Subscriptions, invoices, payments.",    icon: "💳", availableScopes: ["payments", "subscriptions", "invoicing", "refunds"] },
  { key: "quickbooks",  name: "QuickBooks",   category: "billing",     description: "Sync invoices, customers, payments.",   icon: "📒", availableScopes: ["invoicing", "customers", "payments"] },
  { key: "xero",        name: "Xero",         category: "billing",     description: "Cloud accounting & invoice sync.",       icon: "📒", availableScopes: ["invoicing", "customers", "payments"] },
  { key: "square",      name: "Square",       category: "billing",     description: "In-person + online payments.",           icon: "🟦", availableScopes: ["payments"] },
  // Ecommerce
  { key: "shopify",     name: "Shopify",      category: "ecommerce",   description: "Pull orders into the production queue.", icon: "🛍", availableScopes: ["orders", "customers"] },
  { key: "woocommerce", name: "WooCommerce",  category: "ecommerce",   description: "Pull WooCommerce orders + customers.",   icon: "🛍", availableScopes: ["orders", "customers"] },
  { key: "etsy",        name: "Etsy",         category: "ecommerce",   description: "Etsy shop order ingestion.",             icon: "🛍", availableScopes: ["orders"] },
  { key: "amazon",      name: "Amazon",       category: "ecommerce",   description: "Amazon Seller Central order sync.",      icon: "🛍", availableScopes: ["orders"] },
  // Comms
  { key: "twilio",      name: "Twilio",       category: "communications", description: "Outbound SMS for proofs + reminders.", icon: "📱", availableScopes: ["sms"] },
  { key: "mailchimp",   name: "Mailchimp",    category: "communications", description: "Customer marketing campaigns.",        icon: "📨", availableScopes: ["marketing"] },
  // CRM / Marketing
  { key: "hubspot",     name: "HubSpot",      category: "crm-marketing", description: "Sync customers as HubSpot contacts.",   icon: "🧲", availableScopes: ["contacts", "deals"] },
  { key: "salesforce",  name: "Salesforce",   category: "crm-marketing", description: "Salesforce Account/Contact sync.",      icon: "🧲", availableScopes: ["contacts", "opportunities"] },
  // Productivity
  { key: "slack",       name: "Slack",        category: "productivity", description: "Channel notifications for events.",      icon: "💬", availableScopes: ["channel-posts"] },
  { key: "msteams",     name: "Microsoft Teams", category: "productivity", description: "Teams channel notifications.",        icon: "💬", availableScopes: ["channel-posts"] },
  { key: "google-workspace", name: "Google Workspace", category: "productivity", description: "Calendar + Drive integration.",  icon: "📅", availableScopes: ["calendar", "drive"] },
  { key: "m365",        name: "Microsoft 365", category: "productivity", description: "Calendar + OneDrive integration.",       icon: "📅", availableScopes: ["calendar", "drive"] },
  // Shipping
  { key: "shipstation", name: "ShipStation",  category: "shipping",    description: "Generate labels via ShipStation.",       icon: "📦", availableScopes: ["labels", "tracking"] },
  { key: "easypost",    name: "EasyPost",     category: "shipping",    description: "Multi-carrier label + tracking.",        icon: "📦", availableScopes: ["labels", "tracking"] },
  { key: "fedex",       name: "FedEx",        category: "shipping",    description: "Direct FedEx label printing.",            icon: "📦", availableScopes: ["labels", "tracking"] },
  { key: "ups",         name: "UPS",          category: "shipping",    description: "Direct UPS label printing.",              icon: "📦", availableScopes: ["labels", "tracking"] },
  { key: "usps",        name: "USPS",         category: "shipping",    description: "Direct USPS label printing.",             icon: "📦", availableScopes: ["labels", "tracking"] },
  { key: "dhl",         name: "DHL",          category: "shipping",    description: "Direct DHL label printing.",              icon: "📦", availableScopes: ["labels", "tracking"] },
  // Tax
  { key: "avalara",     name: "Avalara",      category: "tax",         description: "Sales-tax calculation per jurisdiction.", icon: "🧾", availableScopes: ["tax-calc"] },
  { key: "taxjar",      name: "TaxJar",       category: "tax",         description: "Sales-tax calculation per jurisdiction.", icon: "🧾", availableScopes: ["tax-calc"] },
  // E-sign
  { key: "docusign",    name: "DocuSign",     category: "esign",       description: "E-signature on quotes + contracts.",      icon: "✍",  availableScopes: ["envelopes"] },
  { key: "pandadoc",    name: "PandaDoc",     category: "esign",       description: "E-signature on quotes + contracts.",      icon: "✍",  availableScopes: ["envelopes"] },
];

export const INTEGRATION_CATEGORIES: { id: IntegrationCategory; label: string }[] = [
  { id: "billing",         label: "Billing" },
  { id: "ecommerce",       label: "Ecommerce" },
  { id: "communications",  label: "Communications" },
  { id: "crm-marketing",   label: "CRM & marketing" },
  { id: "productivity",    label: "Productivity" },
  { id: "shipping",        label: "Shipping" },
  { id: "tax",             label: "Tax" },
  { id: "esign",           label: "E-signature" },
];

export function findIntegration(key: string): IntegrationDef | undefined {
  return INTEGRATION_REGISTRY.find((i) => i.key === key);
}
