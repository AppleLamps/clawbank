import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Create a payment request (request money from another agent)
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = await request.json();
    const { to_agent, amount, reason } = body;

    // Validate to_agent
    if (!to_agent || typeof to_agent !== 'string') {
      return jsonError('Recipient agent name is required', 'MISSING_RECIPIENT');
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return jsonError('Amount must be positive', 'INVALID_AMOUNT');
    }

    if (amount > 10000) {
      return jsonError('Maximum request amount is $10,000', 'AMOUNT_TOO_LARGE');
    }

    // Find recipient agent (the one who will pay)
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
      return jsonError('Cannot request payment from yourself', 'SELF_REQUEST');
    }

    // Check for existing pending request to same agent
    const existingRequests = await sql`
      SELECT id FROM payment_requests
      WHERE from_agent_id = ${auth.agent.id}
        AND to_agent_id = ${recipient.id}
        AND status = 'pending'
        AND expires_at > NOW()
    `;

    if (existingRequests.length > 0) {
      return jsonError('You already have a pending request to this agent', 'DUPLICATE_REQUEST');
    }

    // Create payment request
    const result = await sql`
      INSERT INTO payment_requests (from_agent_id, to_agent_id, amount, reason)
      VALUES (${auth.agent.id}, ${recipient.id}, ${amount}, ${reason || null})
      RETURNING id, amount, reason, status, created_at, expires_at
    `;

    const paymentRequest = result[0];

    return jsonSuccess({
      request: {
        id: paymentRequest.id,
        to_agent: recipient.name,
        amount: parseFloat(paymentRequest.amount),
        reason: paymentRequest.reason,
        status: paymentRequest.status,
        created_at: paymentRequest.created_at,
        expires_at: paymentRequest.expires_at
      },
      message: `Payment request sent to ${recipient.name} for $${parseFloat(paymentRequest.amount).toFixed(2)}`
    }, 201);

  } catch (error) {
    console.error('Payment request error:', error);
    return jsonError('Failed to create payment request', 'REQUEST_FAILED', 500);
  }
}
