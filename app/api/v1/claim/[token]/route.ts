import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { jsonError, jsonSuccess } from '@/lib/auth';

// GET /api/v1/claim/[token] - Lookup claim token and return agent info
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    if (!token || token.length < 10) {
      return jsonError('Invalid claim token', 'INVALID_TOKEN', 400);
    }

    const result = await sql`
      SELECT
        name,
        description,
        verification_code,
        is_claimed,
        created_at,
        claimed_at,
        owner_x_handle
      FROM agents
      WHERE claim_token = ${token} AND is_active = TRUE
    `;

    if (result.length === 0) {
      return jsonError('Claim token not found or expired', 'TOKEN_NOT_FOUND', 404);
    }

    const agent = result[0];

    return jsonSuccess({
      agent: {
        name: agent.name,
        description: agent.description,
        verification_code: agent.verification_code,
        is_claimed: agent.is_claimed,
        created_at: agent.created_at,
        claimed_at: agent.claimed_at,
        owner_x_handle: agent.owner_x_handle
      }
    });

  } catch (error) {
    console.error('Claim lookup error:', error);
    return jsonError('Failed to lookup claim', 'LOOKUP_FAILED', 500);
  }
}
