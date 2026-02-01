import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Get financial summary/analytics
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    // Get account balances by type
    const accounts = await sql`
      SELECT
        type,
        COUNT(*) as count,
        COALESCE(SUM(balance), 0) as total_balance,
        COALESCE(SUM(total_interest_earned), 0) as total_interest
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND status = 'active'
      GROUP BY type
    `;

    // Get totals
    const totals = await sql`
      SELECT
        COALESCE(SUM(balance), 0) as net_worth,
        COALESCE(SUM(total_interest_earned), 0) as total_interest_earned,
        COUNT(*) as account_count
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND status = 'active'
    `;

    // Get transfers sent (last 30 days)
    const transfersSent = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.agent_id = ${auth.agent.id}
        AND t.type = 'transfer_out'
        AND t.counterparty_agent_id IS NOT NULL
        AND t.created_at > NOW() - INTERVAL '30 days'
    `;

    // Get transfers received (last 30 days)
    const transfersReceived = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.agent_id = ${auth.agent.id}
        AND t.type = 'transfer_in'
        AND t.counterparty_agent_id IS NOT NULL
        AND t.created_at > NOW() - INTERVAL '30 days'
    `;

    // Get donations made
    const donationsMade = await sql`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM donations
      WHERE from_agent_id = ${auth.agent.id}
    `;

    // Get donations received
    const donationsReceived = await sql`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM donations
      WHERE to_agent_id = ${auth.agent.id}
    `;

    // Get net worth rank
    const rank = await sql`
      SELECT rank
      FROM leaderboard_net_worth
      WHERE agent_id = ${auth.agent.id}
    `;

    // Build account breakdown
    const accountBreakdown: Record<string, any> = {};
    let totalBalance = 0;
    for (const acc of accounts) {
      accountBreakdown[acc.type] = {
        count: parseInt(acc.count),
        balance: parseFloat(acc.total_balance),
        interest_earned: parseFloat(acc.total_interest)
      };
      totalBalance += parseFloat(acc.total_balance);
    }

    // Calculate savings rate (non-checking / total)
    const checkingBalance = accountBreakdown.checking?.balance || 0;
    const savingsRate = totalBalance > 0
      ? ((totalBalance - checkingBalance) / totalBalance) * 100
      : 0;

    return jsonSuccess({
      summary: {
        net_worth: parseFloat(totals[0]?.net_worth || '0'),
        total_interest_earned: parseFloat(totals[0]?.total_interest_earned || '0'),
        account_count: parseInt(totals[0]?.account_count || '0'),
        net_worth_rank: rank.length > 0 ? parseInt(rank[0].rank) : null
      },
      accounts: accountBreakdown,
      activity_30_days: {
        transfers_sent: parseFloat(transfersSent[0]?.total || '0'),
        transfers_received: parseFloat(transfersReceived[0]?.total || '0'),
        net_transfers: parseFloat(transfersReceived[0]?.total || '0') - parseFloat(transfersSent[0]?.total || '0')
      },
      donations: {
        total_donated: parseFloat(donationsMade[0]?.total || '0'),
        donations_made: parseInt(donationsMade[0]?.count || '0'),
        total_received: parseFloat(donationsReceived[0]?.total || '0'),
        donations_received: parseInt(donationsReceived[0]?.count || '0')
      },
      savings_rate_percent: Math.round(savingsRate * 10) / 10
    });

  } catch (error) {
    console.error('Analytics summary error:', error);
    return jsonError('Failed to fetch analytics', 'FETCH_FAILED', 500);
  }
}
