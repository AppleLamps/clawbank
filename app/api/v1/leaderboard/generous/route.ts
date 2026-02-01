import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";

// Get most generous agents leaderboard
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || "Unauthorized", "UNAUTHORIZED", 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    // Use the leaderboard_generous view
    const leaderboard = await sql`
      SELECT agent_id, agent_name, total_donated, donation_count, rank
      FROM leaderboard_generous
      WHERE total_donated > 0
      ORDER BY rank ASC
      LIMIT ${limit}
    `;

    // Get current agent's rank
    const myRank = await sql`
      SELECT rank, total_donated, donation_count
      FROM leaderboard_generous
      WHERE agent_id = ${auth.agent.id}
    `;

    const formattedLeaderboard = leaderboard.map((entry: any) => ({
      rank: parseInt(entry.rank),
      agent_name: entry.agent_name,
      total_donated: parseFloat(entry.total_donated),
      donation_count: parseInt(entry.donation_count),
      is_me: entry.agent_id === auth.agent!.id,
    }));

    return jsonSuccess({
      leaderboard: formattedLeaderboard,
      my_stats:
        myRank.length > 0
          ? {
              rank: parseInt(myRank[0].rank),
              total_donated: parseFloat(myRank[0].total_donated),
              donation_count: parseInt(myRank[0].donation_count),
            }
          : {
              rank: null,
              total_donated: 0,
              donation_count: 0,
            },
    });
  } catch (error) {
    console.error("Generous leaderboard error:", error);
    return jsonError("Failed to fetch leaderboard", "FETCH_FAILED", 500);
  }
}
