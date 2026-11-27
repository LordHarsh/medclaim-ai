/**
 * The small set of parts every screen is built from. No hooks here, so both server and client components use them.
 */
import Link from "next/link";
import { ChevronDown, ShieldCheck } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const inr = (v: number | null | undefined): string =>
  typeof v === "number" && !Number.isNaN(v) ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "–";

export const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");

export const shortDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export const duration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

/* ── Frame ─────────────────────────────────────────────────────────────── */

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md" aria-label="MedClaim AI, home">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-white">
        <ShieldCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">MedClaim</span>
    </Link>
  );
}

export type NavItem = { href: string; label: string; current?: boolean };

/** The bar at the top of every screen: logo, a few plain links, and one slot on the right. */
export function TopBar({ home = "/", nav = [], children }: { home?: string; nav?: NavItem[]; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo href={home} />
        {nav.length > 0 && (
          <nav aria-label="Sections" className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.current ? "page" : undefined}
                className={cx(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[14px]",
                  n.current ? "bg-sunken font-medium text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className={cx("flex shrink-0 items-center gap-2", nav.length === 0 && "ml-auto")}>{children}</div>
      </div>
    </header>
  );
}

export function Page({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return <main className={cx("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", narrow ? "max-w-3xl" : "max-w-6xl")}>{children}</main>;
}

/* ── Controls ──────────────────────────────────────────────────────────── */

type ButtonLook = "primary" | "secondary" | "ghost";
const BUTTON: Record<ButtonLook, string> = {
  primary: "bg-ink text-white hover:bg-ink-2",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
};
const buttonClass = (look: ButtonLook, small: boolean, extra?: string) =>
  cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-45",
    small ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[14px]",
    BUTTON[look],
    extra,
  );

export function Button({
  look = "primary",
  small = false,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { look?: ButtonLook; small?: boolean }) {
  return <button type="button" {...rest} className={buttonClass(look, small, className)} />;
}

export function LinkButton({
  href,
  look = "primary",
  small = false,
  className,
  children,
  external = false,
}: {
  href: string;
  look?: ButtonLook;
  small?: boolean;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} className={buttonClass(look, small, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(look, small, className)}>
      {children}
    </Link>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-card border border-line bg-surface", className)}>{children}</section>;
}

/** A small uppercase label above a group. The only "heading" most cards need. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3", className)}>{children}</p>;
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <Label>{label}</Label>
      <p className={cx("mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums", tone)}>{value}</p>
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-ink-3">{icon}</span>
      <p className="mt-4 text-[16px] font-medium">{title}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

const NOTICE = {
  bad: "border-bad/25 bg-bad-soft text-bad",
  stop: "border-stop/25 bg-stop-soft text-stop",
  wait: "border-wait/25 bg-wait-soft text-wait",
  review: "border-review/25 bg-review-soft text-review",
} as const;

export function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof NOTICE;
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-card border px-4 py-3", NOTICE[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        {children && <div className="mt-1 text-[13px] text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

/** Detail that is one click away. Closed by default. */
export function More({ label, children, open = false }: { label: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group" open={open}>
      <summary className="inline-flex list-none items-center gap-1 rounded-md py-1 text-[13px] font-medium text-ink-2 hover:text-ink">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-md bg-sunken", className)} />;
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-ctl border border-line bg-sunken p-3 font-mono text-[11px] leading-4 text-ink-2">
      {children}
    </pre>
  );
}
