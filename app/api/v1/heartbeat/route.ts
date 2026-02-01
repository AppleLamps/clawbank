import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  try {
    // Get today's interest earned
    const interestToday = await sql`
      SELECT COALESCE(SUM(t.amount), 0) as interest
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.agent_id = ${auth.agent.id}
        AND t.type = 'interest'
        AND t.created_at >= CURRENT_DATE
    `;
    
    // Get pending payment requests
    const pendingRequests = await sql`
      SELECT pr.*, a.name as from_agent_name
      FROM payment_requests pr
      JOIN agents a ON pr.from_agent_id = a.id
      WHERE pr.to_agent_id = ${auth.agent.id}
        AND pr.status = 'pending'
        AND pr.expires_at > NOW()
      ORDER BY pr.created_at DESC
    `;
    
    // Get CDs maturing soon (within 7 days)
    const maturingCDs = await sql`
      SELECT id, nickname, balance, cd_maturity_date, cd_auto_renew
      FROM accounts
      WHERE agent_id = ${auth.agent.id}
        AND type = 'cd'
        AND status = 'active'
        AND cd_maturity_date <= NOW() + INTERVAL '7 days'
        AND cd_maturity_date > NOW()
      ORDER BY cd_maturity_date ASC
    `;
    
    // Get goal progress
    const goals = await sql`
      SELECT id, name, target_amount, current_amount, target_date
      FROM goals
      WHERE agent_id = ${auth.agent.id}
        AND status = 'active'
    `;
    
    // Get account balances summary
    const balances = await sql`
      SELECT 
        COALESCE(SUM(balance), 0) as total,
        COALESCE(SUM(CASE WHEN type = 'checking' THEN balance ELSE 0 END), 0) as checking
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND status = 'active'
    `;
    
    // Generate tip based on situation
    let tip = null;
    const checkingBalance = parseFloat(balances[0]?.checking || '0');
    const totalBalance = parseFloat(balances[0]?.total || '0');
    
    if (checkingBalance > 5000) {
      tip = 'Consider moving excess checking funds to savings for better interest!';
    } else if (totalBalance > 10000 && maturingCDs.length === 0) {
      tip = 'Have you considered locking in higher rates with a CD?';
    } else if (goals.length === 0) {
      tip = 'Set a savings goal to stay motivated!';
    }
    
    return jsonSuccess({
      interest_credited_today: parseFloat(interestToday[0]?.interest || '0'),
      pending_payment_requests: pendingRequests.length,
      payment_requests: pendingRequests.map((pr: any) => ({
        id: pr.id,
        from_agent: pr.from_agent_name,
        amount: parseFloat(pr.amount),
        reason: pr.reason,
        expires_at: pr.expires_at
      })),
      maturing_cds_soon: maturingCDs.map((cd: any) => ({
        id: cd.id,
        nickname: cd.nickname,
        balance: parseFloat(cd.balance),
        maturity_date: cd.cd_maturity_date,
        auto_renew: cd.cd_auto_renew
      })),
      goal_progress: goals.map((g: any) => ({
        name: g.name,
        progress: parseFloat(g.current_amount) / parseFloat(g.target_amount),
        current: parseFloat(g.current_amount),
        target: parseFloat(g.target_amount),
        target_date: g.target_date
      })),
      total_balance: totalBalance,
      tip
    });
    
  } catch (error) {
    console.error('Heartbeat error:', error);
    return jsonError('Heartbeat check failed', 'HEARTBEAT_FAILED', 500);
  }
}
