import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import sql from "@/lib/db";
import type { ClaimRow, MemberRow } from "@/lib/types";

const STEP_MESSAGES: Record<string, string> = {
  SUBMITTED: "Claim submitted - waiting in queue...",
  QUEUED: "Claim queued for processing...",
  DOCUMENT_VERIFICATION: "Verifying your documents...",
  DOCUMENT_EXTRACTION: "Documents verified - Extracting information...",
  POLICY_ENGINE: "Information extracted - Checking policy eligibility...",
  FRAUD_DETECTION: "Eligibility checked - Running fraud detection...",
  FINAL_DECISION: "Finalizing decision...",
  COMPLETED: "Processing complete!",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;

  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify claim ownership
  const members = (await sql(
    "SELECT member_id FROM members WHERE auth_user_id = $1",
    [session.user.id]
  )) as unknown as Pick<MemberRow, "member_id">[];

  if (!members || members.length === 0) {
    return new Response("Member not found", { status: 403 });
  }

  const member = members[0];

  const claims = (await sql(
    "SELECT claim_id FROM claims WHERE claim_id = $1 AND member_id = $2",
    [claimId, member.member_id]
  )) as unknown as Pick<ClaimRow, "claim_id">[];

  if (!claims || claims.length === 0) {
    return new Response("Claim not found", { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let lastStep = "";
  let lastStatus = "";
  let heartbeatTimer: ReturnType<typeof setInterval>;
  let pollTimer: ReturnType<typeof setInterval>;
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          isClosed = true;
        }
      };

      // Heartbeat every 15 seconds
      heartbeatTimer = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          isClosed = true;
        }
      }, 15000);

      // Poll every 2 seconds
      pollTimer = setInterval(async () => {
        if (isClosed) return;

        try {
          const rows = (await sql(
            `SELECT status, current_step, decision, approved_amount,
                    confidence_score, error_message
             FROM claims WHERE claim_id = $1`,
            [claimId]
          )) as unknown as Pick<ClaimRow, "status" | "current_step" | "decision" | "approved_amount" | "confidence_score" | "error_message">[];

          if (!rows || rows.length === 0) {
            sendEvent("error", { error_code: "NOT_FOUND", message: "Claim not found" });
            cleanup(controller);
            return;
          }

          const claim = rows[0];

          // Emit step update if step changed
          if (claim.current_step && claim.current_step !== lastStep) {
            lastStep = claim.current_step;
            sendEvent("step_update", {
              step: claim.current_step,
              status: claim.status,
              message: STEP_MESSAGES[claim.current_step] || `Processing: ${claim.current_step}`,
            });
          }

          // Check terminal states
          if (claim.status !== lastStatus) {
            lastStatus = claim.status;

            if (claim.status === "COMPLETED" && claim.decision) {
              sendEvent("decision", {
                decision: claim.decision,
                approved_amount: claim.approved_amount,
                confidence_score: claim.confidence_score,
              });
              sendEvent("done", {});
              cleanup(controller);
              return;
            }

            if (claim.status === "FAILED" || claim.status === "NEEDS_REUPLOAD") {
              sendEvent("error", {
                error_code: claim.status,
                message: claim.error_message || "An error occurred during processing",
              });
              sendEvent("done", {});
              cleanup(controller);
              return;
            }
          }
        } catch (error) {
          console.error("SSE poll error:", error);
        }
      }, 2000);

      // Max duration: 120 seconds
      setTimeout(() => {
        if (!isClosed) {
          sendEvent("done", {});
          cleanup(controller);
        }
      }, 120000);
    },
    cancel() {
      isClosed = true;
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
    },
  });

  function cleanup(controller: ReadableStreamDefaultController) {
    isClosed = true;
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
    try {
      controller.close();
    } catch {
      // already closed
    }
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
