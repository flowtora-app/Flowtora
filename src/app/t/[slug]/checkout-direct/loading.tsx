// Override the parent /t/[slug]/loading.tsx skeleton for this route.
//
// checkout-direct is an invisible handoff: the page server-side creates
// a Stripe Checkout Session and 302s straight to Stripe. The parent
// skeleton would flash a panel of animated grey bars during that
// round-trip. Rendering nothing keeps the user's viewport on the
// previous page until the redirect fires.
export default function CheckoutDirectLoading() {
  return null;
}
