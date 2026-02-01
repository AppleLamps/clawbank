import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";

// Get best savers leaderboard (ranked by savings rate)
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || "Unauthorized", "UNAUTHORIZED", 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const minBalance = parseFloat(searchParams.get("min_balance") || "1000");

    // Calculate savings rate for each agent
    // Savings rate = (savings + money_market + cd) / total_balance * 100
    const leaderboard = await sql`
      WITH agent_balances AS (
        SELECT
          a.id as agent_id,
          ag.name as agent_name,
          COALESCE(SUM(a.balance), 0) as total_balance,
          COALESCE(SUM(CASE WHEN a.type = 'checking' THEN a.balance ELSE 0 END), 0) as checking,
          COALESCE(SUM(CASE WHEN a.type = 'savings' THEN a.balance ELSE 0 END), 0) as savings,
          COALESCE(SUM(CASE WHEN a.type = 'money_market' THEN a.balance ELSE 0 END), 0) as money_market,
          COALESCE(SUM(CASE WHEN a.type = 'cd' THEN a.balance ELSE 0 END), 0) as cd
        FROM accounts a
        JOIN agents ag ON a.agent_id = ag.id
        WHERE a.status = 'active' AND ag.is_active = TRUE
        GROUP BY a.agent_id, ag.name
        HAVING SUM(a.balance) >= ${minBalance}
      )
      SELECT
        agent_id,
        agent_name,
        total_balance,
        checking,
        savings,
        money_market,
        cd,
        (savings + money_market + cd) as total_saved,
        CASE
          WHEN total_balance > 0
          THEN ((savings + money_market + cd) / total_balance * 100)
          ELSE 0
        END as savings_rate,
        RANK() OVER (
          ORDER BY CASE
            WHEN total_balance > 0
            THEN ((savings + money_market + cd) / total_balance)
            ELSE 0
          END DESC
        ) as rank
      FROM agent_balances
      ORDER BY savings_rate DESC
      LIMIT ${limit}
    `;

    // Get current agent's stats
    const myStats = await sql`
      WITH my_balances AS (
        SELECT
          COALESCE(SUM(balance), 0) as total_balance,
          COALESCE(SUM(CASE WHEN type = 'checking' THEN balance ELSE 0 END), 0) as checking,
          COALESCE(SUM(CASE WHEN type != 'checking' THEN balance ELSE 0 END), 0) as total_saved
        FROM accounts
        WHERE agent_id = ${auth.agent.id} AND status = 'active'
      )
      SELECT
        total_balance,
        checking,
        total_saved,
        CASE
          WHEN total_balance > 0
          THEN (total_saved / total_balance * 100)
          ELSE 0
        END as savings_rate
      FROM my_balances
    `;

    const agentId = auth.agent.id;

    const formattedLeaderboard = leaderboard.map((entry: any) => ({
      rank: parseInt(entry.rank),
      agent_name: entry.agent_name,
      savings_rate: Math.round(parseFloat(entry.savings_rate) * 10) / 10,
      total_balance: parseFloat(entry.total_balance),
      breakdown: {
        checking: parseFloat(entry.checking),
        savings: parseFloat(entry.savings),
        money_market: parseFloat(entry.money_market),
        cd: parseFloat(entry.cd),
      },
      is_me: entry.agent_id === agentId,
    }));

    const myData = myStats[0];
    const myTotalBalance = parseFloat(myData?.total_balance || "0");
    const mySavingsRate = parseFloat(myData?.savings_rate || "0");

    // Find my rank in the full list
    const myRankResult = await sql`
      WITH agent_balances AS (
        SELECT
          agent_id,
          SUM(balance) as total_balance,
          SUM(CASE WHEN type != 'checking' THEN balance ELSE 0 END) as total_saved
        FROM accounts
        WHERE status = 'active'
        GROUP BY agent_id
        HAVING SUM(balance) >= ${minBalance}
      ),
      ranked AS (
        SELECT
          agent_id,
          RANK() OVER (
            ORDER BY CASE
              WHEN total_balance > 0
              THEN (total_saved / total_balance)
              ELSE 0
            END DESC
          ) as rank
        FROM agent_balances
      )
      SELECT rank FROM ranked WHERE agent_id = ${agentId}
    `;

    return jsonSuccess({
      leaderboard: formattedLeaderboard,
      my_stats: {
        savings_rate: Math.round(mySavingsRate * 10) / 10,
        total_balance: myTotalBalance,
        total_saved: parseFloat(myData?.total_saved || "0"),
        rank: myRankResult.length > 0 ? parseInt(myRankResult[0].rank) : null,
        qualifies: myTotalBalance >= minBalance,
      },
      criteria: {
        min_balance: minBalance,
        description:
          "Savings rate = (savings + money_market + cd) / total_balance",
      },
    });
  } catch (error) {
    console.error("Savers leaderboard error:", error);
    return jsonError("Failed to fetch leaderboard", "FETCH_FAILED", 500);
  }
}
