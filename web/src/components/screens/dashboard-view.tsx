/**
 * The member's home. One need: see every claim and what happened to the money, and start a new one.
 */
import Link from "next/link";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { Empty, LinkButton, Page, Stat, TopBar, inr, shortDate } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { categoryLabel, outcomeOf, stepStates, type ClaimLike } from "@/components/claim/model";
import { MiniTrack, StatusPill } from "@/components/claim/pieces";
import { appNav } from "./nav";

export interface DashboardClaimRow extends ClaimLike {
  claim_id: string;
  treatment_date: string;
  hospital_name: string | null;
  created_at: string;
}

export function DashboardView({ memberName, claims }: { memberName: string; claims: DashboardClaimRow[] }) {
  const paid = claims.reduce((sum, c) => sum + (Number(c.approved_amount) || 0), 0);
  const open = claims.filter((c) => c.status === "PROCESSING" || c.status === "QUEUED").length;

  return (
    <div className="min-h-screen">
      <TopBar home="/dashboard" nav={appNav("claims")}>
        <span className="hidden max-w-[160px] truncate text-[13px] text-ink-3 md:block">{memberName}</span>
        <LinkButton href="/claims/new" small>
          <Plus className="h-4 w-4" /> New claim
        </LinkButton>
      </TopBar>
      <Page>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Claims" value={claims.length} />
          <Stat label="Covered" value={inr(paid)} tone={paid > 0 ? "text-ok" : undefined} />
          <Stat label="In progress" value={open} tone={open > 0 ? "text-wait" : undefined} />
        </div>

        <div className="mt-6">
          {claims.length === 0 ? (
            <Empty icon={<FileText className="h-6 w-6" strokeWidth={1.6} />} title="No claims yet">
              <LinkButton href="/claims/new">
                <Plus className="h-4 w-4" /> New claim
              </LinkButton>
              <LinkButton href="/demo" look="secondary">
                See a sample
              </LinkButton>
            </Empty>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {claims.map((c) => {
                const outcome = outcomeOf(c);
                return (
                  <li key={c.claim_id} className="border-b border-line last:border-b-0">
                    <Link href={`/claims/${c.claim_id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas sm:gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-2">
                        <CategoryIcon category={c.category} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{categoryLabel(c.category)}</span>
                        <span className="block truncate text-[13px] text-ink-3">
                          {shortDate(c.treatment_date)}
                          {c.hospital_name ? ` · ${c.hospital_name}` : ""}
                        </span>
                      </span>
                      <span className="hidden sm:block">
                        <MiniTrack states={stepStates(c)} />
                      </span>
                      <span className="w-24 shrink-0 text-right">
                        <span className="block text-[15px] font-semibold tabular-nums">
                          {c.approved_amount !== null && c.approved_amount !== undefined ? inr(Number(c.approved_amount)) : inr(Number(c.claimed_amount))}
                        </span>
                        <span className="block text-[12px] text-ink-3 tabular-nums">
                          {c.approved_amount !== null && c.approved_amount !== undefined ? `of ${inr(Number(c.claimed_amount))}` : "claimed"}
                        </span>
                      </span>
                      <span className="hidden w-36 shrink-0 justify-end sm:flex">
                        <StatusPill outcome={outcome} />
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                    </Link>
                    <span className="-mt-2 flex items-center gap-3 px-4 pb-3 pl-[68px] sm:hidden">
                      <StatusPill outcome={outcome} />
                      <MiniTrack states={stepStates(c)} />
                    </span>
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
