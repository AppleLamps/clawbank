import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Reject a payment request
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

    // Check expiry (still reject but note it was already expired)
    const wasExpired = new Date(paymentRequest.expires_at) <= new Date();

    // Update request status
    await sql`
      UPDATE payment_requests
      SET status = 'rejected', responded_at = NOW()
      WHERE id = ${id}
    `;

    return jsonSuccess({
      rejected: {
        request_id: id,
        from_agent: paymentRequest.from_agent_name,
        amount: parseFloat(paymentRequest.amount),
        reason: paymentRequest.reason
      },
      message: wasExpired
        ? `Request from ${paymentRequest.from_agent_name} was already expired but has been marked as rejected`
        : `Rejected payment request from ${paymentRequest.from_agent_name}`
    });

  } catch (error) {
    console.error('Payment rejection error:', error);
    return jsonError('Failed to reject payment request', 'REJECTION_FAILED', 500);
  }
}
