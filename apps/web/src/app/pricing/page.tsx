import type { Metadata } from "next";
import PricingView from "@/components/Pricing";
import { SITE_NAME } from "@/lib/site";

const DESCRIPTION =
  "Free, Starter, Pro and Business plans for the RYUKSAIDSO agent control plane — UPI, cards and net banking via Cashfree, billed monthly or yearly.";

export const metadata: Metadata = {
  title: "Pricing",
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    url: "/pricing",
    title: `Pricing · ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default function PricingPage() {
  return <PricingView />;
}
