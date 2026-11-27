/**
 * One claim, for the member who filed it. One need: what happened to my money, and why.
 */
import { Plus } from "lucide-react";
import { LinkButton, Page, TopBar, inr, shortDate } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { ClaimResult } from "@/components/claim/claim-result";
import { ClaimProgress } from "@/components/claim-progress";
import { categoryLabel, isFinished, outcomeOf, type ClaimLike } from "@/components/claim/model";
import { appNav } from "./nav";

export interface ClaimDetail extends ClaimLike {
  claim_id: string;
  treatment_date: string;
  hospital_name: string | null;
  created_at: string;
}

export function ClaimDetailView({
  claim,
  documents = [],
  offline = false,
}: {
  claim: ClaimDetail;
  documents?: { name: string; url: string }[];
  /** Set by the gallery, which has no stream to listen to. */
  offline?: boolean;
}) {
  const finished = isFinished(claim.status);
  const outcome = outcomeOf(claim);
  return (
    <div className="min-h-screen">
      <TopBar home="/dashboard" nav={appNav("claims")}>
        <LinkButton href="/claims/new" look="secondary" small>
          <Plus className="h-4 w-4" /> New claim
        </LinkButton>
      </TopBar>
      <Page narrow={!finished}>
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-2 ring-1 ring-line">
            <CategoryIcon category={claim.category} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em]">{categoryLabel(claim.category)}</h1>
            <p className="truncate text-[13px] text-ink-3">
              {inr(claim.claimed_amount)} · {shortDate(claim.treatment_date)}
              {claim.hospital_name ? ` · ${claim.hospital_name}` : ""}
            </p>
          </div>
        </div>

        {finished ? (
          <ClaimResult
            claim={claim}
            audience="member"
            documents={documents}
            actions={
              outcome === "stopped" || outcome === "failed" ? (
                <LinkButton href="/claims/new" small>
                  {outcome === "stopped" ? "Upload again" : "Try again"}
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <ClaimProgress claimId={claim.claim_id} initialStatus={claim.status} initialStep={claim.current_step ?? "SUBMITTED"} offline={offline} />
        )}

        <p className="mt-6 font-mono text-[11px] text-ink-3">Claim {claim.claim_id}</p>
      </Page>
    </div>
  );
}
