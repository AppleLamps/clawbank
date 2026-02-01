import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Make a donation
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = await request.json();
    const { to_agent, to_name, amount, message } = body;

    // Must specify either to_agent or to_name
    if (!to_agent && !to_name) {
      return jsonError('Must specify either to_agent (agent name) or to_name (charity/cause)', 'MISSING_RECIPIENT');
    }

    if (to_agent && to_name) {
      return jsonError('Specify only one of to_agent or to_name, not both', 'CONFLICTING_RECIPIENT');
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return jsonError('Amount must be positive', 'INVALID_AMOUNT');
    }

    if (amount > 10000) {
      return jsonError('Maximum donation amount is $10,000', 'AMOUNT_TOO_LARGE');
    }

    // Get donor's checking account
    const donorAccounts = await sql`
      SELECT id, balance
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND type = 'checking' AND status = 'active'
      LIMIT 1
    `;

    if (donorAccounts.length === 0) {
      return jsonError('No active checking account found', 'NO_CHECKING');
    }

    const donorChecking = donorAccounts[0];
    const donorBalance = parseFloat(donorChecking.balance);

    if (donorBalance < amount) {
      return jsonError('Insufficient funds', 'INSUFFICIENT_FUNDS');
    }

    let recipientAgentId = null;
    let recipientName = to_name;
    let recipientChecking = null;

    // If donating to an agent, look them up
    if (to_agent) {
      const recipients = await sql`
        SELECT id, name, is_active
        FROM agents
        WHERE LOWER(name) = LOWER(${to_agent})
      `;

      if (recipients.length === 0) {
        return jsonError('Recipient agent not found', 'AGENT_NOT_FOUND');
      }

      const recipient = recipients[0];

      if (!recipient.is_active) {
        return jsonError('Recipient agent is not active', 'AGENT_INACTIVE');
      }

      if (recipient.id === auth.agent.id) {
        return jsonError('Cannot donate to yourself', 'SELF_DONATION');
      }

      recipientAgentId = recipient.id;
      recipientName = recipient.name;

      // Get recipient's checking account
      const recipientAccounts = await sql`
        SELECT id, balance
        FROM accounts
        WHERE agent_id = ${recipient.id} AND type = 'checking' AND status = 'active'
        LIMIT 1
      `;

      if (recipientAccounts.length === 0) {
        return jsonError('Recipient has no active checking account', 'NO_RECIPIENT_ACCOUNT');
      }

      recipientChecking = recipientAccounts[0];
    }

    // Deduct from donor
    const newDonorBalance = donorBalance - amount;
    await sql`UPDATE accounts SET balance = ${newDonorBalance} WHERE id = ${donorChecking.id}`;

    // Record donor's transaction
    await sql`
      INSERT INTO transactions (
        account_id, type, amount, balance_after,
        counterparty_agent_id, counterparty_agent_name, memo
      )
      VALUES (
        ${donorChecking.id}, 'donation', ${amount}, ${newDonorBalance},
        ${recipientAgentId}, ${recipientName},
        ${message ? `Donation: ${message}` : `Donation to ${recipientName}`}
      )
    `;

    // If donating to an agent, credit them
    let newRecipientBalance = null;
    if (recipientChecking) {
      newRecipientBalance = parseFloat(recipientChecking.balance) + amount;
      await sql`UPDATE accounts SET balance = ${newRecipientBalance} WHERE id = ${recipientChecking.id}`;

      // Record recipient's transaction
      await sql`
        INSERT INTO transactions (
          account_id, type, amount, balance_after,
          counterparty_agent_id, counterparty_agent_name, memo
        )
        VALUES (
          ${recipientChecking.id}, 'donation', ${amount}, ${newRecipientBalance},
          ${auth.agent.id}, ${auth.agent.name},
          ${message ? `Donation received: ${message}` : `Donation from ${auth.agent.name}`}
        )
      `;
    }

    // Record in donations table
    await sql`
      INSERT INTO donations (from_agent_id, to_agent_id, to_name, amount, message)
      VALUES (${auth.agent.id}, ${recipientAgentId}, ${recipientAgentId ? null : recipientName}, ${amount}, ${message || null})
    `;

    return jsonSuccess({
      donation: {
        to: recipientName,
        to_type: recipientAgentId ? 'agent' : 'cause',
        amount,
        message: message || null
      },
      new_balance: newDonorBalance,
      message: `Donated $${amount.toFixed(2)} to ${recipientName}. Thank you for your generosity!`
    }, 201);

  } catch (error) {
    console.error('Donation error:', error);
    return jsonError('Donation failed', 'DONATION_FAILED', 500);
  }
}
