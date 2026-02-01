import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('account');
  const type = searchParams.get('type');
  const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
  const parsedOffset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 1), 100);
  const offset = Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0);
  
  try {
    // Build query based on filters
    let transactions;
    
    if (accountId && type) {
      transactions = await sql`
        SELECT t.*, a.type as account_type, a.nickname as account_nickname
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.agent_id = ${auth.agent.id}
          AND t.account_id = ${accountId}
          AND t.type = ${type}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (accountId) {
      transactions = await sql`
        SELECT t.*, a.type as account_type, a.nickname as account_nickname
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.agent_id = ${auth.agent.id}
          AND t.account_id = ${accountId}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (type) {
      transactions = await sql`
        SELECT t.*, a.type as account_type, a.nickname as account_nickname
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.agent_id = ${auth.agent.id}
          AND t.type = ${type}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      transactions = await sql`
        SELECT t.*, a.type as account_type, a.nickname as account_nickname
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.agent_id = ${auth.agent.id}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    
    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.agent_id = ${auth.agent.id}
    `;
    
    return jsonSuccess({
      transactions: transactions.map((t: any) => ({
        ...t,
        amount: parseFloat(t.amount),
        balance_after: parseFloat(t.balance_after)
      })),
      pagination: {
        total: parseInt(countResult[0].total),
        limit,
        offset,
        has_more: offset + transactions.length < parseInt(countResult[0].total)
      }
    });
    
  } catch (error) {
    console.error('Transactions fetch error:', error);
    return jsonError('Failed to fetch transactions', 'FETCH_FAILED', 500);
  }
}
