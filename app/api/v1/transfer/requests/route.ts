import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// List payment requests
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'incoming'; // incoming or outgoing
    const includeAll = searchParams.get('all') === 'true'; // include expired/responded

    let requests;

    if (type === 'outgoing') {
      // Requests I sent (asking others for money)
      if (includeAll) {
        requests = await sql`
          SELECT pr.*, a.name as to_agent_name
          FROM payment_requests pr
          JOIN agents a ON pr.to_agent_id = a.id
          WHERE pr.from_agent_id = ${auth.agent.id}
          ORDER BY pr.created_at DESC
        `;
      } else {
        requests = await sql`
          SELECT pr.*, a.name as to_agent_name
          FROM payment_requests pr
          JOIN agents a ON pr.to_agent_id = a.id
          WHERE pr.from_agent_id = ${auth.agent.id}
            AND pr.status = 'pending'
            AND pr.expires_at > NOW()
          ORDER BY pr.created_at DESC
        `;
      }
    } else {
      // Requests I received (others asking me for money)
      if (includeAll) {
        requests = await sql`
          SELECT pr.*, a.name as from_agent_name
          FROM payment_requests pr
          JOIN agents a ON pr.from_agent_id = a.id
          WHERE pr.to_agent_id = ${auth.agent.id}
          ORDER BY pr.created_at DESC
        `;
      } else {
        requests = await sql`
          SELECT pr.*, a.name as from_agent_name
          FROM payment_requests pr
          JOIN agents a ON pr.from_agent_id = a.id
          WHERE pr.to_agent_id = ${auth.agent.id}
            AND pr.status = 'pending'
            AND pr.expires_at > NOW()
          ORDER BY pr.created_at DESC
        `;
      }
    }

    const formattedRequests = requests.map((req: any) => {
      const now = new Date();
      const expiresAt = new Date(req.expires_at);
      const hoursRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));

      return {
        id: req.id,
        from_agent: type === 'incoming' ? req.from_agent_name : auth.agent!.name,
        to_agent: type === 'outgoing' ? req.to_agent_name : auth.agent!.name,
        amount: parseFloat(req.amount),
        reason: req.reason,
        status: req.status,
        created_at: req.created_at,
        expires_at: req.expires_at,
        hours_remaining: req.status === 'pending' ? hoursRemaining : null,
        responded_at: req.responded_at
      };
    });

    return jsonSuccess({
      requests: formattedRequests,
      type,
      count: formattedRequests.length
    });

  } catch (error) {
    console.error('Payment requests fetch error:', error);
    return jsonError('Failed to fetch payment requests', 'FETCH_FAILED', 500);
  }
}
