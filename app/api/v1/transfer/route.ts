import { NextRequest } from 'next/server';
import { sql, withTransaction } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Internal transfer between own accounts
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  try {
    const body = await request.json();
    const { from_account, to_account, amount } = body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return jsonError('Amount must be positive', 'INVALID_AMOUNT');
    }
    
    // Get source account
    const source = await sql`
      SELECT id, type, balance, withdrawals_this_month, withdrawal_limit, cd_maturity_date
      FROM accounts 
      WHERE id = ${from_account} 
        AND agent_id = ${auth.agent.id}
        AND status = 'active'
    `;
    
    if (source.length === 0) {
      return jsonError('Source account not found', 'ACCOUNT_NOT_FOUND');
    }
    
    const sourceAccount = source[0];
    
    // Check if it's a CD that hasn't matured
    if (sourceAccount.type === 'cd' && sourceAccount.cd_maturity_date && 
        new Date(sourceAccount.cd_maturity_date) > new Date()) {
      return jsonError('Cannot withdraw from CD before maturity. Use early-withdraw endpoint.', 'CD_NOT_MATURED');
    }
    
    // Check withdrawal limits for savings/money market
    if (sourceAccount.withdrawal_limit !== null && 
        sourceAccount.withdrawals_this_month >= sourceAccount.withdrawal_limit) {
      return jsonError(
        `Monthly withdrawal limit reached (${sourceAccount.withdrawal_limit} per month)`, 
        'WITHDRAWAL_LIMIT'
      );
    }
    
    // Check balance
    if (parseFloat(sourceAccount.balance) < amount) {
      return jsonError('Insufficient funds', 'INSUFFICIENT_FUNDS');
    }
    
    // Get destination account
    const dest = await sql`
      SELECT id, type, balance
      FROM accounts 
      WHERE id = ${to_account} 
        AND agent_id = ${auth.agent.id}
        AND status = 'active'
    `;
    
    if (dest.length === 0) {
      return jsonError('Destination account not found', 'ACCOUNT_NOT_FOUND');
    }
    
    // Can't transfer to a CD
    if (dest[0].type === 'cd') {
      return jsonError('Cannot transfer to a CD account', 'INVALID_DESTINATION');
    }
    
    const destAccount = dest[0];
    const newSourceBalance = parseFloat(sourceAccount.balance) - amount;
    const newDestBalance = parseFloat(destAccount.balance) + amount;

    // Perform transfer atomically
    await withTransaction(async (tx) => {
      await tx`UPDATE accounts SET balance = ${newSourceBalance} WHERE id = ${from_account}`;
      await tx`UPDATE accounts SET balance = ${newDestBalance} WHERE id = ${to_account}`;

      // Update withdrawal count if applicable
      if (sourceAccount.withdrawal_limit !== null) {
        await tx`
          UPDATE accounts
          SET withdrawals_this_month = withdrawals_this_month + 1
          WHERE id = ${from_account}
        `;
      }

      // Record transactions
      await tx`
        INSERT INTO transactions (account_id, related_account_id, type, amount, balance_after, memo)
        VALUES
          (${from_account}, ${to_account}, 'transfer_out', ${amount}, ${newSourceBalance}, 'Internal transfer'),
          (${to_account}, ${from_account}, 'transfer_in', ${amount}, ${newDestBalance}, 'Internal transfer')
      `;
    });
    
    return jsonSuccess({
      transfer: {
        from_account,
        to_account,
        amount,
        from_new_balance: newSourceBalance,
        to_new_balance: newDestBalance
      },
      message: `Transferred $${amount.toFixed(2)} successfully`
    });
    
  } catch (error) {
    console.error('Transfer error:', error);
    return jsonError('Transfer failed', 'TRANSFER_FAILED', 500);
  }
}
