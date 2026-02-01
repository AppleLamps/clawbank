import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Deposit from checking to target account
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

    // Get target account, verify ownership
    const targetAccounts = await sql`
      SELECT id, type, balance, status
      FROM accounts
      WHERE id = ${id} AND agent_id = ${auth.agent.id}
    `;

    if (targetAccounts.length === 0) {
      return jsonError('Account not found', 'ACCOUNT_NOT_FOUND', 404);
    }

    const targetAccount = targetAccounts[0];

    if (targetAccount.status !== 'active') {
      return jsonError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    if (targetAccount.type === 'cd') {
      return jsonError('Cannot deposit to CD after creation. Open a new CD instead.', 'CD_NO_DEPOSIT');
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
    const checkingBalance = parseFloat(checking.balance);

    if (checkingBalance < amount) {
      return jsonError('Insufficient funds in checking account', 'INSUFFICIENT_FUNDS');
    }

    // Perform transfer
    const newCheckingBalance = checkingBalance - amount;
    const newTargetBalance = parseFloat(targetAccount.balance) + amount;

    await sql`UPDATE accounts SET balance = ${newCheckingBalance} WHERE id = ${checking.id}`;
    await sql`UPDATE accounts SET balance = ${newTargetBalance} WHERE id = ${targetAccount.id}`;

    // Record transactions
    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, related_account_id, memo)
      VALUES (${checking.id}, 'transfer_out', ${amount}, ${newCheckingBalance}, ${targetAccount.id},
              ${`Deposit to ${targetAccount.type} account`})
    `;

    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, related_account_id, memo)
      VALUES (${targetAccount.id}, 'transfer_in', ${amount}, ${newTargetBalance}, ${checking.id},
              'Deposit from checking')
    `;

    return jsonSuccess({
      deposit: {
        amount,
        to_account: targetAccount.id,
        to_account_type: targetAccount.type,
        new_balance: newTargetBalance
      },
      checking_balance: newCheckingBalance,
      message: `Deposited $${amount.toFixed(2)} to ${targetAccount.type} account`
    });

  } catch (error) {
    console.error('Deposit error:', error);
    return jsonError('Deposit failed', 'DEPOSIT_FAILED', 500);
  }
}
