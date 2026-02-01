import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Approve a payment request (pay the requester)
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
    // Get the payment request
    const requests = await sql`
      SELECT pr.*, a.name as from_agent_name
      FROM payment_requests pr
      JOIN agents a ON pr.from_agent_id = a.id
      WHERE pr.id = ${id}
    `;

    if (requests.length === 0) {
      return jsonError('Payment request not found', 'REQUEST_NOT_FOUND', 404);
    }

    const paymentRequest = requests[0];

    // Verify this request is to the current agent
    if (paymentRequest.to_agent_id !== auth.agent.id) {
      return jsonError('This payment request is not addressed to you', 'NOT_YOUR_REQUEST', 403);
    }

    // Check status
    if (paymentRequest.status !== 'pending') {
      return jsonError(`This request has already been ${paymentRequest.status}`, 'ALREADY_RESPONDED');
    }

    // Check expiry
    if (new Date(paymentRequest.expires_at) <= new Date()) {
      await sql`UPDATE payment_requests SET status = 'expired' WHERE id = ${id}`;
      return jsonError('This payment request has expired', 'REQUEST_EXPIRED');
    }

    const amount = parseFloat(paymentRequest.amount);

    // Get payer's (current agent's) checking account
    const payerAccounts = await sql`
      SELECT id, balance
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND type = 'checking' AND status = 'active'
      LIMIT 1
    `;

    if (payerAccounts.length === 0) {
      return jsonError('No active checking account found', 'NO_CHECKING');
    }

    const payerChecking = payerAccounts[0];
    const payerBalance = parseFloat(payerChecking.balance);

    if (payerBalance < amount) {
      return jsonError('Insufficient funds to approve this request', 'INSUFFICIENT_FUNDS');
    }

    // Get requester's checking account
    const requesterAccounts = await sql`
      SELECT id, balance
      FROM accounts
      WHERE agent_id = ${paymentRequest.from_agent_id} AND type = 'checking' AND status = 'active'
      LIMIT 1
    `;

    if (requesterAccounts.length === 0) {
      return jsonError('Requester has no active checking account', 'NO_RECIPIENT_ACCOUNT');
    }

    const requesterChecking = requesterAccounts[0];

    // Execute transfer: payer → requester
    const newPayerBalance = payerBalance - amount;
    const newRequesterBalance = parseFloat(requesterChecking.balance) + amount;

    await sql`UPDATE accounts SET balance = ${newPayerBalance} WHERE id = ${payerChecking.id}`;
    await sql`UPDATE accounts SET balance = ${newRequesterBalance} WHERE id = ${requesterChecking.id}`;

    // Record transactions
    await sql`
      INSERT INTO transactions (
        account_id, type, amount, balance_after,
        counterparty_agent_id, counterparty_agent_name, memo
      )
      VALUES (
        ${payerChecking.id}, 'transfer_out', ${amount}, ${newPayerBalance},
        ${paymentRequest.from_agent_id}, ${paymentRequest.from_agent_name},
        ${`Payment request approved: ${paymentRequest.reason || 'No reason provided'}`}
      )
    `;

    await sql`
      INSERT INTO transactions (
        account_id, type, amount, balance_after,
        counterparty_agent_id, counterparty_agent_name, memo
      )
      VALUES (
        ${requesterChecking.id}, 'transfer_in', ${amount}, ${newRequesterBalance},
        ${auth.agent.id}, ${auth.agent.name},
        ${`Payment request fulfilled: ${paymentRequest.reason || 'No reason provided'}`}
      )
    `;

    // Update request status
    await sql`
      UPDATE payment_requests
      SET status = 'approved', responded_at = NOW()
      WHERE id = ${id}
    `;

    return jsonSuccess({
      approved: {
        request_id: id,
        paid_to: paymentRequest.from_agent_name,
        amount,
        reason: paymentRequest.reason
      },
      new_balance: newPayerBalance,
      message: `Paid $${amount.toFixed(2)} to ${paymentRequest.from_agent_name}`
    });

  } catch (error) {
    console.error('Payment approval error:', error);
    return jsonError('Failed to approve payment request', 'APPROVAL_FAILED', 500);
  }
}
