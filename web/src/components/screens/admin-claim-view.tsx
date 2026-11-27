/**
 * One claim, for the operations team. One need: why did the pipeline decide this, and can I trust it.
 */
import { ArrowLeft } from "lucide-react";
import { Label, LinkButton, Page, TopBar, duration, inr, shortDate } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { ClaimResult } from "@/components/claim/claim-result";
import { AGENT_STEPS, categoryLabel, isFinished, outcomeOf } from "@/components/claim/model";
import { StatusPill } from "@/components/claim/pieces";
import type { DashboardClaim } from "@/app/admin/actions";
import { appNav } from "./nav";

export function AdminClaimView({ claim, documents = [] }: { claim: DashboardClaim; documents?: { name: string; url: string }[] }) {
  const took = claim.completed_at ? new Date(claim.completed_at).getTime() - new Date(claim.created_at).getTime() : null;
  const at = AGENT_STEPS.find((a) => a.step === claim.current_step);
  return (
    <div className="min-h-screen">
      <TopBar home="/dashboard" nav={appNav("ops")}>
        <LinkButton href="/admin" look="ghost" small>
          <ArrowLeft className="h-4 w-4" /> All claims
        </LinkButton>
      </TopBar>
      <Page>
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-2 ring-1 ring-line">
              <CategoryIcon category={claim.category} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em]">{categoryLabel(claim.category)}</h1>
              <p className="truncate font-mono text-[12px] text-ink-3" title={claim.claim_id}>
                {claim.claim_id}
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            <Fact k="Member" v={claim.member_id} />
            <Fact k="Claimed" v={inr(claim.claimed_amount)} />
            <Fact k="Treated" v={shortDate(claim.treatment_date)} />
            {claim.hospital_name && <Fact k="Hospital" v={claim.hospital_name} />}
            <Fact k="Took" v={took !== null ? duration(took) : "–"} />
          </dl>
        </div>

        {!isFinished(claim.status) && (
          <div className="mb-4">
            <StatusPill outcome={outcomeOf(claim)} label={at ? at.name : undefined} />
          </div>
        )}

        <ClaimResult claim={claim} audience="ops" documents={documents} />
      </Page>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt>
        <Label>{k}</Label>
      </dt>
      <dd className="mt-0.5 max-w-[220px] truncate text-[14px] font-medium tabular-nums">{v}</dd>
    </div>
  );
}
