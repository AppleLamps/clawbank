import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Get public profile of another agent
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return jsonError('Agent name is required (use ?name=AgentName)', 'MISSING_NAME');
    }

    // Find agent by name
    const agents = await sql`
      SELECT id, name, description, is_claimed, is_active, created_at, last_active
      FROM agents
      WHERE LOWER(name) = LOWER(${name})
    `;

    if (agents.length === 0) {
      return jsonError('Agent not found', 'AGENT_NOT_FOUND', 404);
    }

    const agent = agents[0];

    if (!agent.is_active) {
      return jsonError('Agent is not active', 'AGENT_INACTIVE');
    }

    // Get net worth and rank
    const netWorth = await sql`
      SELECT total_balance, total_interest_earned, rank
      FROM leaderboard_net_worth
      WHERE agent_id = ${agent.id}
    `;

    // Get account count
    const accountCount = await sql`
      SELECT COUNT(*) as count
      FROM accounts
      WHERE agent_id = ${agent.id} AND status = 'active'
    `;

    // Get donation stats (public)
    const donationStats = await sql`
      SELECT total_donated, donation_count, rank
      FROM leaderboard_generous
      WHERE agent_id = ${agent.id}
    `;

    // Calculate how recently active
    const lastActive = new Date(agent.last_active);
    const now = new Date();
    const hoursAgo = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60));

    let activityStatus;
    if (hoursAgo < 1) activityStatus = 'Active now';
    else if (hoursAgo < 24) activityStatus = `Active ${hoursAgo} hours ago`;
    else if (hoursAgo < 168) activityStatus = `Active ${Math.floor(hoursAgo / 24)} days ago`;
    else activityStatus = 'Inactive';

    return jsonSuccess({
      profile: {
        name: agent.name,
        description: agent.description,
        is_verified: agent.is_claimed,
        member_since: agent.created_at,
        activity_status: activityStatus,
        profile_url: `/agents/${encodeURIComponent(agent.name)}`
      },
      finances: {
        net_worth: netWorth.length > 0 ? parseFloat(netWorth[0].total_balance) : 0,
        total_interest_earned: netWorth.length > 0 ? parseFloat(netWorth[0].total_interest_earned) : 0,
        net_worth_rank: netWorth.length > 0 ? parseInt(netWorth[0].rank) : null,
        account_count: parseInt(accountCount[0]?.count || '0')
      },
      generosity: {
        total_donated: donationStats.length > 0 ? parseFloat(donationStats[0].total_donated) : 0,
        donation_count: donationStats.length > 0 ? parseInt(donationStats[0].donation_count) : 0,
        generosity_rank: donationStats.length > 0 && parseFloat(donationStats[0].total_donated) > 0
          ? parseInt(donationStats[0].rank)
          : null
      },
      is_me: agent.id === auth.agent.id
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    return jsonError('Failed to fetch profile', 'FETCH_FAILED', 500);
  }
}
