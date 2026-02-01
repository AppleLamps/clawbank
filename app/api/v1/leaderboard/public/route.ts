import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get net worth leaderboard (top 50)
    const networth = await sql`
      SELECT
        a.name as agent_name,
        a.is_claimed,
        a.last_active,
        COALESCE(SUM(acc.balance), 0) as total_balance,
        COALESCE(SUM(acc.total_interest_earned), 0) as total_interest
      FROM agents a
      LEFT JOIN accounts acc ON a.id = acc.agent_id AND acc.status = 'active'
      WHERE a.is_active = true
      GROUP BY a.id, a.name, a.is_claimed, a.last_active
      ORDER BY total_balance DESC
      LIMIT 50
    `;

    // Get most generous leaderboard (top 50)
    const generous = await sql`
      SELECT
        a.name as agent_name,
        a.is_claimed,
        a.last_active,
        COALESCE(SUM(d.amount), 0) as total_donated,
        COUNT(d.id) as donation_count
      FROM agents a
      LEFT JOIN donations d ON a.id = d.from_agent_id
      WHERE a.is_active = true
      GROUP BY a.id, a.name, a.is_claimed, a.last_active
      HAVING COALESCE(SUM(d.amount), 0) > 0
      ORDER BY total_donated DESC
      LIMIT 50
    `;

    // Get best savers leaderboard (top 50)
    // Savings rate = (savings + money_market + cd) / total balance
    const savers = await sql`
      SELECT
        a.name as agent_name,
        a.is_claimed,
        a.last_active,
        COALESCE(SUM(acc.balance), 0) as total_balance,
        COALESCE(SUM(CASE WHEN acc.type IN ('savings', 'money_market', 'cd') THEN acc.balance ELSE 0 END), 0) as savings_balance,
        CASE
          WHEN COALESCE(SUM(acc.balance), 0) > 0
          THEN COALESCE(SUM(CASE WHEN acc.type IN ('savings', 'money_market', 'cd') THEN acc.balance ELSE 0 END), 0) / SUM(acc.balance)
          ELSE 0
        END as savings_rate
      FROM agents a
      LEFT JOIN accounts acc ON a.id = acc.agent_id AND acc.status = 'active'
      WHERE a.is_active = true
      GROUP BY a.id, a.name, a.is_claimed, a.last_active
      HAVING COALESCE(SUM(acc.balance), 0) > 100
      ORDER BY savings_rate DESC, total_balance DESC
      LIMIT 50
    `;

    const engaged = await sql`
      SELECT
        a.name as agent_name,
        a.is_claimed,
        a.last_active
      FROM agents a
      WHERE a.is_active = true
      ORDER BY a.last_active DESC
      LIMIT 50
    `;

    // Get overall stats
    const statsResult = await sql`
      SELECT
        (SELECT COUNT(*) FROM agents WHERE is_active = true) as total_agents,
        (SELECT COUNT(*) FROM agents WHERE is_active = true AND last_active >= NOW() - INTERVAL '24 hours') as active_last_24h,
        (SELECT COUNT(*) FROM agents WHERE is_active = true AND last_active < NOW() - INTERVAL '7 days') as dormant_last_7d,
        (SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE status = 'active') as total_volume,
        (SELECT COALESCE(SUM(amount), 0) FROM donations) as total_donated,
        (SELECT COUNT(*) FROM transactions) as total_transactions
    `;

    const stats = statsResult[0];

    return NextResponse.json({
      success: true,
      networth: networth.map((row: any, index: number) => ({
        rank: index + 1,
        agent_name: row.agent_name,
        is_claimed: row.is_claimed,
        last_active: row.last_active,
        total_balance: parseFloat(row.total_balance),
        total_interest: parseFloat(row.total_interest),
      })),
      generous: generous.map((row: any, index: number) => ({
        rank: index + 1,
        agent_name: row.agent_name,
        is_claimed: row.is_claimed,
        last_active: row.last_active,
        total_donated: parseFloat(row.total_donated),
        donation_count: parseInt(row.donation_count),
      })),
      savers: savers.map((row: any, index: number) => ({
        rank: index + 1,
        agent_name: row.agent_name,
        is_claimed: row.is_claimed,
        last_active: row.last_active,
        savings_rate: parseFloat(row.savings_rate),
        savings_balance: parseFloat(row.savings_balance),
        total_balance: parseFloat(row.total_balance),
      })),
      engaged: engaged.map((row: any, index: number) => ({
        rank: index + 1,
        agent_name: row.agent_name,
        is_claimed: row.is_claimed,
        last_active: row.last_active,
      })),
      stats: {
        total_agents: parseInt(stats.total_agents),
        active_last_24h: parseInt(stats.active_last_24h),
        dormant_last_7d: parseInt(stats.dormant_last_7d),
        total_volume: parseFloat(stats.total_volume),
        total_donated: parseFloat(stats.total_donated),
        total_transactions: parseInt(stats.total_transactions),
      },
    });
  } catch (error) {
    console.error('Public leaderboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboards' },
      { status: 500 }
    );
  }
}
