"use client";

/**
 * The landing page shows the product instead of describing it: a real recorded claim runs through the five agents
 * and lands on its verdict, then the next one starts. Nothing here calls the backend.
 */
import { useEffect, useState } from "react";
import { Card, inr } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { categoryLabel, moneyOf, outcomeOf, stepStates } from "@/components/claim/model";
import { MoneySplit, PipelineTrack, StatusPill } from "@/components/claim/pieces";
import { useReplay } from "@/components/claim/use-replay";
import { claimOf, type DemoSample } from "@/lib/demo/samples";

export function HeroReplay({ samples }: { samples: DemoSample[] }) {
  const [at, setAt] = useState(0);
  const sample = samples[at % samples.length];
  // Keyed by the sample, so each claim starts from an empty track.
  return <Run key={`${sample.id}-${at}`} sample={sample} onDone={() => setAt((n) => n + 1)} />;
}

function Run({ sample, onDone }: { sample: DemoSample; onDone: () => void }) {
  const claim = claimOf(sample);
  const replay = useReplay(sample.run.trace.steps.length, stepStates(claim));
  const { play, showAll, finished } = replay;

  // People who asked for less motion get the finished picture and no cycling.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) showAll();
    else play();
  }, [play, showAll]);

  useEffect(() => {
    if (!finished || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
    // onDone is recreated on every render of the parent; the timer should only follow `finished`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const outcome = outcomeOf(claim);
  return (
    <Card className="p-5 shadow-[0_18px_50px_-28px_rgba(23,25,28,0.35)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-medium">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-2">
            <CategoryIcon category={claim.category} />
          </span>
          {categoryLabel(claim.category)}
          <span className="font-normal text-ink-3">{inr(claim.claimed_amount)}</span>
        </p>
        {finished ? <StatusPill outcome={outcome} /> : <StatusPill outcome="running" />}
      </div>
      <div className="mt-6">
        <PipelineTrack states={replay.states} />
      </div>
      <div className="mt-6 min-h-[112px] border-t border-line pt-5">
        {finished && (
          <div className="animate-rise">
            <MoneySplit money={moneyOf(claim)} payer="Member pays" />
          </div>
        )}
      </div>
    </Card>
  );
}
