"use client";

import { useState } from "react";
import { Check, FastForward, Play, RotateCcw, X } from "lucide-react";
import { Button, Card, Label, LinkButton, cx, duration, inr, shortDate } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { ClaimResult } from "@/components/claim/claim-result";
import { AGENT_STEPS, OUTCOME, asList, categoryLabel, outcomeOf, stepStates, str, type AgentStep } from "@/components/claim/model";
import { DocThumbs, StatusPill } from "@/components/claim/pieces";
import { useReplay } from "@/components/claim/use-replay";
import { claimOf, type DemoSample } from "@/lib/demo/samples";

export function DemoClient({ samples }: { samples: DemoSample[] }) {
  const [activeId, setActiveId] = useState(samples[0]?.id ?? "");
  const sample = samples.find((s) => s.id === activeId) ?? samples[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Pick a claim, run it</h1>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {samples.map((s) => {
            const on = s.id === sample.id;
            const o = outcomeOf(claimOf(s));
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-pressed={on}
                  title={s.why}
                  className={cx(
                    "flex h-full w-full flex-col items-start gap-2 rounded-card border bg-surface p-3 text-left transition-colors",
                    on ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-2">
                      <CategoryIcon category={s.testCase.input.claim_category} />
                    </span>
                    <span className={cx("h-2.5 w-2.5 rounded-full", OUTCOME[o].solid)} aria-hidden="true" />
                  </span>
                  <span className="text-[14px] font-medium leading-tight">{s.tag}</span>
                  <span className={cx("text-[12px]", OUTCOME[o].text)}>{OUTCOME[o].label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Keyed by the sample, so choosing another claim starts from an empty track. */}
      <Replay key={sample.id} sample={sample} />
    </div>
  );
}

function Replay({ sample }: { sample: DemoSample }) {
  const claim = claimOf(sample);
  const final = stepStates(claim);
  const stepsRun = sample.run.trace.steps.length;
  const replay = useReplay(stepsRun, final);
  const [picked, setPicked] = useState<AgentStep | null>(null);

  // While it plays, the panel follows the agent that just finished. A click takes over until the next run.
  const following = replay.revealed > 0 ? AGENT_STEPS[Math.min(replay.revealed, stepsRun) - 1].step : null;
  const selected = picked ?? following;

  const run = () => {
    setPicked(null);
    replay.play();
  };

  const tc = sample.testCase;
  // The thumbnails gain what the first agent read off them once that agent has run.
  const read = replay.revealed > 0 ? asList(sample.run.trace.steps.find((s) => s.step_name === "DOCUMENT_VERIFICATION")?.details?.documents) : [];
  const docs = sample.documents.map((d) => {
    const hit = read.find((x) => str(x.s3_key).endsWith(d.name));
    return {
      name: d.name,
      url: d.url,
      type: hit ? str(hit.detected_type) : undefined,
      quality: hit && typeof hit.quality_score === "number" ? hit.quality_score : null,
      patient: hit ? str(hit.patient_name_found) || undefined : undefined,
    };
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{sample.title}</h2>
            {!replay.started && <StatusPill outcome="queued" label="Not run yet" />}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
            <Fact k="Claimed" v={inr(tc.input.claimed_amount)} />
            <Fact k="Category" v={categoryLabel(tc.input.claim_category)} />
            <Fact k="Treated" v={shortDate(tc.input.treatment_date)} />
            <Fact k="Member" v={tc.input.member_id} />
          </dl>
          <div className="mt-4">
            <DocThumbs docs={docs} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
          <Button onClick={run} className="lg:h-12 lg:px-6 lg:text-[15px]">
            {replay.started ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {replay.started ? "Run again" : "Run the claim"}
          </Button>
          {!replay.finished && (
            <Button look="ghost" onClick={replay.showAll}>
              <FastForward className="h-4 w-4" /> Skip to result
            </Button>
          )}
        </div>
      </Card>

      <ClaimResult
        claim={claim}
        audience="ops"
        documents={sample.documents}
        states={replay.states}
        hideVerdict={!replay.finished}
        verdictLast
        selected={selected}
        onSelect={setPicked}
        actions={replay.finished ? <Expected sample={sample} /> : undefined}
      />

      {replay.finished && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-4">
          <p className="text-[14px] text-ink-2">
            Recorded {shortDate(sample.run.recorded_at)}, {duration(sample.run.duration_ms)} end to end.
          </p>
          <LinkButton href="/admin/eval" look="secondary" small>
            Run it live
          </LinkButton>
        </div>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt>
        <Label>{k}</Label>
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-medium tabular-nums">{v}</dd>
    </div>
  );
}

/** The test case this sample comes from says what should happen. One chip says whether it did. */
function Expected({ sample }: { sample: DemoSample }) {
  const exp = sample.testCase.expected;
  const got = sample.run.decision ?? sample.run.status;
  const want = exp.early_stop ? "NEEDS_REUPLOAD" : (exp.decision ?? "");
  const amountOk = exp.approved_amount === undefined || exp.approved_amount === null || exp.approved_amount === sample.run.approved_amount;
  const ok = want === got && amountOk;
  return (
    <span
      title={exp.notes}
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}
    >
      {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
      {ok ? "Matches the expected result" : "Differs from the expected result"}
    </span>
  );
}
