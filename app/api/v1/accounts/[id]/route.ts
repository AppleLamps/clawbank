import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Get single account with recent transactions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  const { id } = await params;

  try {
    // Get account, verify ownership
    const accounts = await sql`
      SELECT
        id, type, nickname, balance, interest_rate,
        cd_term_months, cd_maturity_date, cd_auto_renew, cd_principal,
        withdrawals_this_month, withdrawal_limit,
        interest_accrued, total_interest_earned,
        status, created_at, updated_at
      FROM accounts
      WHERE id = ${id} AND agent_id = ${auth.agent.id}
    `;

    if (accounts.length === 0) {
      return jsonError('Account not found', 'ACCOUNT_NOT_FOUND', 404);
    }

    const account = accounts[0];

    // Get recent transactions
    const transactions = await sql`
      SELECT id, type, amount, balance_after, memo, created_at
      FROM transactions
      WHERE account_id = ${id}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return jsonSuccess({
      account: {
        ...account,
        balance: parseFloat(account.balance),
        interest_rate: parseFloat(account.interest_rate),
        interest_accrued: parseFloat(account.interest_accrued),
        total_interest_earned: parseFloat(account.total_interest_earned),
        cd_principal: account.cd_principal ? parseFloat(account.cd_principal) : null
      },
      recent_transactions: transactions.map((t: any) => ({
        ...t,
        amount: parseFloat(t.amount),
        balance_after: parseFloat(t.balance_after)
      }))
    });

  } catch (error) {
    console.error('Account fetch error:', error);
    return jsonError('Failed to fetch account', 'FETCH_FAILED', 500);
  }
}

// Update account settings (nickname, cd_auto_renew)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  const { id } = await params;

  try {
    // Verify ownership
    const accounts = await sql`
      SELECT id, type FROM accounts
      WHERE id = ${id} AND agent_id = ${auth.agent.id}
    `;

    if (accounts.length === 0) {
      return jsonError('Account not found', 'ACCOUNT_NOT_FOUND', 404);
    }

    const body = await request.json();
    const { nickname, cd_auto_renew } = body;

    const account = accounts[0];

    // Update nickname if provided
    if (nickname !== undefined) {
      await sql`
        UPDATE accounts SET nickname = ${nickname} WHERE id = ${id}
      `;
    }

    // Update cd_auto_renew if provided (only for CDs)
    if (cd_auto_renew !== undefined) {
      if (account.type !== 'cd') {
        return jsonError('Auto-renew setting only applies to CD accounts', 'NOT_CD_ACCOUNT');
      }
      await sql`
        UPDATE accounts SET cd_auto_renew = ${cd_auto_renew} WHERE id = ${id}
      `;
    }

    return jsonSuccess({
      message: 'Account updated successfully'
    });

  } catch (error) {
    console.error('Account update error:', error);
    return jsonError('Failed to update account', 'UPDATE_FAILED', 500);
  }
}
