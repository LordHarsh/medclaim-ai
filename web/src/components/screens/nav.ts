import type { NavItem } from "@/components/ui";

const ITEMS = [
  { key: "claims", href: "/dashboard", label: "My claims" },
  { key: "samples", href: "/demo", label: "Samples" },
  { key: "tests", href: "/admin/eval", label: "Test runner" },
  { key: "ops", href: "/admin", label: "Operations" },
] as const;

export type NavKey = (typeof ITEMS)[number]["key"];

/** The same four places on every screen; one of them is marked as where you are. */
export function appNav(current?: NavKey): NavItem[] {
  return ITEMS.map((i) => ({ href: i.href, label: i.label, current: i.key === current }));
}

export const REPO = "https://github.com/LordHarsh/medclaim-ai";
