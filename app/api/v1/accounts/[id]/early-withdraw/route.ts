import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Early CD withdrawal with penalty
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { confirm } = body;

    // Get CD account, verify ownership
    const cdAccounts = await sql`
      SELECT id, type, balance, status, cd_principal, cd_maturity_date,
             interest_rate, total_interest_earned, created_at
      FROM accounts
      WHERE id = ${id} AND agent_id = ${auth.agent.id}
    `;

    if (cdAccounts.length === 0) {
      return jsonError('Account not found', 'ACCOUNT_NOT_FOUND', 404);
    }

    const cdAccount = cdAccounts[0];

    if (cdAccount.type !== 'cd') {
      return jsonError('This endpoint is only for CD accounts', 'NOT_CD_ACCOUNT');
    }

    if (cdAccount.status !== 'active') {
      return jsonError('CD is not active', 'CD_INACTIVE');
    }

    // Check if already matured
    if (cdAccount.cd_maturity_date && new Date(cdAccount.cd_maturity_date) <= new Date()) {
      return jsonError('CD has already matured. Use regular withdraw or wait for auto-processing.', 'CD_MATURED');
    }

    const balance = parseFloat(cdAccount.balance);
    const principal = parseFloat(cdAccount.cd_principal || cdAccount.balance);
    const earnedInterest = balance - principal;
    const interestRate = parseFloat(cdAccount.interest_rate);

    // Calculate penalty: 3 months of earned interest (or all interest if less)
    // 3 months of interest = principal * (rate / 12) * 3
    const threeMonthsInterest = principal * (interestRate / 12) * 3;
    const penalty = Math.min(earnedInterest, threeMonthsInterest);
    const amountAfterPenalty = balance - penalty;

    // If not confirmed, return preview
    if (!confirm) {
      return jsonSuccess({
        preview: true,
        cd_balance: balance,
        principal,
        earned_interest: earnedInterest,
        penalty,
        amount_after_penalty: amountAfterPenalty,
        message: `Early withdrawal penalty: $${penalty.toFixed(2)} (3 months interest or all earned interest, whichever is less). You will receive $${amountAfterPenalty.toFixed(2)}. Send confirm: true to proceed.`
      });
    }

    // Get checking account
    const checkingAccounts = await sql`
      SELECT id, balance
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND type = 'checking' AND status = 'active'
      LIMIT 1
    `;

    if (checkingAccounts.length === 0) {
      return jsonError('No active checking account found', 'NO_CHECKING');
    }

    const checking = checkingAccounts[0];
    const newCheckingBalance = parseFloat(checking.balance) + amountAfterPenalty;

    // Close CD
    await sql`
      UPDATE accounts
      SET status = 'closed', balance = 0, closed_at = NOW()
      WHERE id = ${cdAccount.id}
    `;

    // Credit checking
    await sql`UPDATE accounts SET balance = ${newCheckingBalance} WHERE id = ${checking.id}`;

    // Record transactions
    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, memo)
      VALUES (${cdAccount.id}, 'cd_early_withdrawal', ${amountAfterPenalty}, 0,
              ${`Early withdrawal. Penalty: $${penalty.toFixed(2)}`})
    `;

    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, related_account_id, memo)
      VALUES (${checking.id}, 'transfer_in', ${amountAfterPenalty}, ${newCheckingBalance}, ${cdAccount.id},
              'CD early withdrawal proceeds')
    `;

    return jsonSuccess({
      early_withdrawal: {
        cd_account: cdAccount.id,
        original_balance: balance,
        penalty,
        amount_received: amountAfterPenalty
      },
      checking_balance: newCheckingBalance,
      message: `CD closed early. Penalty of $${penalty.toFixed(2)} applied. $${amountAfterPenalty.toFixed(2)} transferred to checking.`
    });

  } catch (error) {
    console.error('Early withdrawal error:', error);
    return jsonError('Early withdrawal failed', 'EARLY_WITHDRAW_FAILED', 500);
  }
}
