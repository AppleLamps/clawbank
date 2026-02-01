import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Withdraw from account to checking
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
    const { amount } = body;

    // Validate amount
    if (!amount || amount <= 0) {
      return jsonError('Amount must be positive', 'INVALID_AMOUNT');
    }

    // Get source account, verify ownership
    const sourceAccounts = await sql`
      SELECT id, type, balance, status, withdrawals_this_month, withdrawal_limit
      FROM accounts
      WHERE id = ${id} AND agent_id = ${auth.agent.id}
    `;

    if (sourceAccounts.length === 0) {
      return jsonError('Account not found', 'ACCOUNT_NOT_FOUND', 404);
    }

    const sourceAccount = sourceAccounts[0];

    if (sourceAccount.status !== 'active') {
      return jsonError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    if (sourceAccount.type === 'cd') {
      return jsonError('Cannot withdraw from CD before maturity. Use early-withdraw endpoint for early withdrawal with penalty.', 'CD_NO_WITHDRAW');
    }

    if (sourceAccount.type === 'checking') {
      return jsonError('This endpoint is for withdrawing to checking. Use /transfer for checking transfers.', 'USE_TRANSFER');
    }

    // Check withdrawal limit
    if (sourceAccount.withdrawal_limit !== null &&
        sourceAccount.withdrawals_this_month >= sourceAccount.withdrawal_limit) {
      return jsonError(
        `Monthly withdrawal limit (${sourceAccount.withdrawal_limit}) reached for this account`,
        'WITHDRAWAL_LIMIT_REACHED'
      );
    }

    const sourceBalance = parseFloat(sourceAccount.balance);

    if (sourceBalance < amount) {
      return jsonError('Insufficient funds', 'INSUFFICIENT_FUNDS');
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

    // Perform transfer
    const newSourceBalance = sourceBalance - amount;
    const newCheckingBalance = parseFloat(checking.balance) + amount;

    await sql`
      UPDATE accounts
      SET balance = ${newSourceBalance},
          withdrawals_this_month = withdrawals_this_month + 1
      WHERE id = ${sourceAccount.id}
    `;
    await sql`UPDATE accounts SET balance = ${newCheckingBalance} WHERE id = ${checking.id}`;

    // Record transactions
    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, related_account_id, memo)
      VALUES (${sourceAccount.id}, 'transfer_out', ${amount}, ${newSourceBalance}, ${checking.id},
              'Withdrawal to checking')
    `;

    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, related_account_id, memo)
      VALUES (${checking.id}, 'transfer_in', ${amount}, ${newCheckingBalance}, ${sourceAccount.id},
              ${`Withdrawal from ${sourceAccount.type} account`})
    `;

    const remainingWithdrawals = sourceAccount.withdrawal_limit !== null
      ? sourceAccount.withdrawal_limit - sourceAccount.withdrawals_this_month - 1
      : null;

    return jsonSuccess({
      withdrawal: {
        amount,
        from_account: sourceAccount.id,
        from_account_type: sourceAccount.type,
        new_balance: newSourceBalance
      },
      checking_balance: newCheckingBalance,
      withdrawals_remaining_this_month: remainingWithdrawals,
      message: `Withdrew $${amount.toFixed(2)} from ${sourceAccount.type} to checking`
    });

  } catch (error) {
    console.error('Withdrawal error:', error);
    return jsonError('Withdrawal failed', 'WITHDRAWAL_FAILED', 500);
  }
}
