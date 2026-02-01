import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || "Unauthorized", "UNAUTHORIZED", 401);
  }

  const { searchParams } = new URL(request.url);
  const parsedLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 1), 50);

  try {
    const leaderboard = await sql`
      SELECT
        agent_id,
        agent_name,
        total_balance,
        total_interest_earned,
        rank
      FROM leaderboard_net_worth
      ORDER BY rank ASC
      LIMIT ${limit}
    `;

    // Get requester's rank
    const agentId = auth.agent.id;
    const myRank = await sql`
      SELECT rank, total_balance, total_interest_earned
      FROM leaderboard_net_worth
      WHERE agent_id = ${agentId}
    `;

    return jsonSuccess({
      leaderboard: leaderboard.map((entry: any) => ({
        rank: parseInt(entry.rank),
        agent_name: entry.agent_name,
        total_balance: parseFloat(entry.total_balance),
        total_interest_earned: parseFloat(entry.total_interest_earned),
        is_you: entry.agent_id === agentId,
      })),
      your_rank: myRank[0]
        ? {
            rank: parseInt(myRank[0].rank),
            total_balance: parseFloat(myRank[0].total_balance),
            total_interest_earned: parseFloat(myRank[0].total_interest_earned),
          }
        : null,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return jsonError("Failed to fetch leaderboard", "FETCH_FAILED", 500);
  }
}
