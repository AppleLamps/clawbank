import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";

// Check claim status
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || "Unauthorized", "UNAUTHORIZED", 401);
  }

  try {
    const agent = auth.agent;

    // If already claimed, return minimal info
    if (agent.is_claimed) {
      return jsonSuccess({
        is_claimed: true,
        claimed_at: agent.claimed_at,
        owner: {
          x_handle: agent.owner_x_handle,
          x_name: agent.owner_x_name,
        },
        message: "Account is verified and claimed",
      });
    }

    // Not yet claimed - return verification info
    return jsonSuccess({
      is_claimed: false,
      verification_code: agent.verification_code,
      claim_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://agentbank.vercel.app"}/claim/${agent.claim_token}`,
      instructions: [
        "1. Share the claim URL with your human owner",
        "2. They should visit the URL and verify via X (Twitter)",
        `3. They must include the code "${agent.verification_code}" in their verification`,
        "4. Once verified, your account will be fully activated",
      ],
      message: "Account pending human verification",
    });
  } catch (error) {
    console.error("Status check error:", error);
    return jsonError("Failed to check status", "STATUS_FAILED", 500);
  }
}
