/**
 * The operations home. One need: see what the pipeline decided lately, and spot the claims that need a person.
 */
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card, Empty, Label, LinkButton, Page, Stat, TopBar, cx, duration, inr } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { OUTCOME, categoryLabel, outcomeOf, stepStates, type Outcome } from "@/components/claim/model";
import { MiniTrack, StatusPill } from "@/components/claim/pieces";
import type { DashboardClaim, DashboardStats } from "@/app/admin/actions";
import { appNav } from "./nav";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
};

export function AdminView({ claims, stats }: { claims: DashboardClaim[]; stats: DashboardStats }) {
  const mix: { outcome: Outcome; count: number }[] = [
    { outcome: "approved", count: stats.approved },
    { outcome: "partial", count: stats.partial },
    { outcome: "rejected", count: stats.rejected },
    { outcome: "review", count: stats.manual_review },
  ];
  const decided = mix.reduce((n, m) => n + m.count, 0);

  return (
    <div className="min-h-screen">
      <TopBar home="/dashboard" nav={appNav("ops")}>
        <LinkButton href="/admin/eval" look="secondary" small>
          Run tests
        </LinkButton>
      </TopBar>
      <Page>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_2fr]">
          <Stat label="Claims" value={stats.total} />
          <Stat label="Average time" value={duration(stats.avg_processing_ms)} />
          <Card className="col-span-2 px-4 py-3.5 lg:col-span-1">
            <Label>Decisions</Label>
            <div className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-sunken" role="img" aria-label={mix.map((m) => `${m.count} ${OUTCOME[m.outcome].label}`).join(", ")}>
              {mix.map((m) => (
                <span key={m.outcome} className={cx("h-full", OUTCOME[m.outcome].solid)} style={{ width: `${(m.count / Math.max(decided, 1)) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
              {mix.map((m) => (
                <li key={m.outcome} className="flex items-center gap-1.5">
                  <span className={cx("h-2.5 w-2.5 rounded-[3px]", OUTCOME[m.outcome].solid)} aria-hidden="true" />
                  {OUTCOME[m.outcome].label} <span className="font-medium tabular-nums text-ink">{m.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="mt-5">
          {claims.length === 0 ? (
            <Empty icon={<Inbox className="h-6 w-6" strokeWidth={1.6} />} title="No claims yet">
              <LinkButton href="/admin/eval">Run a test claim</LinkButton>
            </Empty>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              <li className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_110px_150px_90px] items-center gap-3 border-b border-line px-4 py-2.5 lg:grid" aria-hidden="true">
                <Label>Claim</Label>
                <Label>Progress</Label>
                <Label className="text-right">Claimed</Label>
                <Label className="text-right">Covered</Label>
                <Label>Result</Label>
                <Label className="text-right">Fraud</Label>
              </li>
              {claims.map((c) => {
                const outcome = outcomeOf(c);
                const fraud = c.fraud_score;
                const covered = outcome === "rejected" ? 0 : c.approved_amount;
                return (
                  <li key={c.claim_id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/admin/claims/${c.claim_id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-canvas lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_110px_150px_90px]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                          <CategoryIcon category={c.category} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium">
                            {categoryLabel(c.category)} <span className="font-normal text-ink-3">· {c.member_id}</span>
                          </span>
                          <span className="block truncate font-mono text-[11px] text-ink-3">
                            {c.claim_id.slice(-8)} · {when(c.created_at)}
                          </span>
                        </span>
                      </span>
                      <span className="hidden lg:block">
                        <MiniTrack states={stepStates(c)} />
                      </span>
                      <span className="hidden text-right text-[14px] tabular-nums lg:block">{inr(c.claimed_amount)}</span>
                      <span className={cx("text-right text-[14px] font-semibold tabular-nums", c.approved_amount ? "text-ok" : "text-ink-3")}>
                        {covered !== null ? inr(covered) : <span className="lg:hidden">{inr(c.claimed_amount)}</span>}
                        {covered === null && <span className="hidden lg:inline">–</span>}
                      </span>
                      <span className="col-span-2 flex items-center gap-3 lg:col-span-1">
                        <StatusPill outcome={outcome} />
                        <span className="lg:hidden">
                          <MiniTrack states={stepStates(c)} />
                        </span>
                      </span>
                      <span className="hidden items-center justify-end gap-1.5 text-[13px] tabular-nums lg:flex">
                        {fraud !== null ? (
                          <>
                            <span className={cx("h-2 w-2 rounded-full", fraud >= 0.5 ? "bg-bad" : fraud >= 0.3 ? "bg-part" : "bg-ok")} aria-hidden="true" />
                            {fraud.toFixed(2)}
                          </>
                        ) : (
                          <span className="text-ink-3">–</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Page>
    </div>
  );
}
