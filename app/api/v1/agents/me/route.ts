import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  const agent = auth.agent;
  
  // Get account summary
  const accounts = await sql`
    SELECT type, SUM(balance) as total, SUM(total_interest_earned) as interest
    FROM accounts 
    WHERE agent_id = ${agent.id} AND status = 'active'
    GROUP BY type
  `;
  
  // Get net worth
  const netWorth = await sql`
    SELECT COALESCE(SUM(balance), 0) as total_balance,
           COALESCE(SUM(total_interest_earned), 0) as total_interest
    FROM accounts 
    WHERE agent_id = ${agent.id} AND status = 'active'
  `;
  
  // Get rank
  const rank = await sql`
    SELECT rank FROM leaderboard_net_worth WHERE agent_id = ${agent.id}
  `;
  
  return jsonSuccess({
    agent: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      is_claimed: agent.is_claimed,
      owner: agent.owner_x_handle ? {
        x_handle: agent.owner_x_handle,
        x_name: agent.owner_x_name,
        x_avatar: agent.owner_x_avatar
      } : null,
      created_at: agent.created_at,
      last_active: agent.last_active
    },
    finances: {
      total_balance: parseFloat(netWorth[0]?.total_balance || '0'),
      total_interest_earned: parseFloat(netWorth[0]?.total_interest || '0'),
      net_worth_rank: rank[0]?.rank || null,
      accounts_by_type: accounts.reduce((acc: any, row: any) => {
        acc[row.type] = {
          balance: parseFloat(row.total),
          interest_earned: parseFloat(row.interest)
        };
        return acc;
      }, {})
    }
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  try {
    const body = await request.json();
    const { description, metadata } = body;
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (description !== undefined) {
      updates.push('description');
      values.push(description);
    }
    
    if (metadata !== undefined) {
      updates.push('metadata');
      values.push(JSON.stringify(metadata));
    }
    
    if (updates.length === 0) {
      return jsonError('No valid fields to update', 'NO_UPDATES');
    }
    
    // Build dynamic update
    if (description !== undefined) {
      await sql`UPDATE agents SET description = ${description} WHERE id = ${auth.agent.id}`;
    }
    if (metadata !== undefined) {
      await sql`UPDATE agents SET metadata = ${JSON.stringify(metadata)}::jsonb WHERE id = ${auth.agent.id}`;
    }
    
    return jsonSuccess({ message: 'Profile updated' });
    
  } catch (error) {
    console.error('Profile update error:', error);
    return jsonError('Failed to update profile', 'UPDATE_FAILED', 500);
  }
}
