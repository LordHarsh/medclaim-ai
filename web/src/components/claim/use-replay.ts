"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_STEPS, type StepState } from "./model";

/** How long each agent is shown as running during a replay. The recorded run took far longer. */
const STEP_MS = 1100;

/**
 * Steps through a finished run one agent at a time.
 * `stepsRun` is how many agents actually ran (one, when the first agent stopped the pipeline).
 */
export function useReplay(stepsRun: number, final: StepState[]) {
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const play = useCallback(() => {
    stop();
    setRevealed(0);
    const tick = (i: number) => {
      if (i >= stepsRun) {
        setRunning(-1);
        return;
      }
      setRunning(i);
      timer.current = setTimeout(() => {
        setRevealed(i + 1);
        tick(i + 1);
      }, STEP_MS);
    };
    tick(0);
  }, [stepsRun, stop]);

  const showAll = useCallback(() => {
    stop();
    setRunning(-1);
    setRevealed(stepsRun);
  }, [stepsRun, stop]);

  const reset = useCallback(() => {
    stop();
    setRunning(-1);
    setRevealed(0);
  }, [stop]);

  useEffect(() => stop, [stop]);

  const finished = revealed >= stepsRun && running === -1;
  const started = revealed > 0 || running >= 0;
  const states: StepState[] = AGENT_STEPS.map((_, i) => {
    if (i < revealed) return final[i] ?? "done";
    if (i === running) return "running";
    if (i >= stepsRun && finished) return "skipped";
    return "waiting";
  });

  return { revealed, running, finished, started, states, play, showAll, reset };
}
