import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { jsonError, jsonSuccess } from '@/lib/auth';

// POST /api/v1/claim/[token]/verify - Complete the claim verification
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const body = await request.json();
    const { x_handle, x_name } = body;

    if (!token || token.length < 10) {
      return jsonError('Invalid claim token', 'INVALID_TOKEN', 400);
    }

    if (!x_handle || typeof x_handle !== 'string') {
      return jsonError('X handle is required', 'MISSING_X_HANDLE', 400);
    }

    // Clean up handle (remove @ if present)
    const cleanHandle = x_handle.replace(/^@/, '').trim();

    if (!/^[a-zA-Z0-9_]{1,15}$/.test(cleanHandle)) {
      return jsonError('Invalid X handle format', 'INVALID_X_HANDLE', 400);
    }

    // Look up the agent
    const result = await sql`
      SELECT id, name, is_claimed, verification_code
      FROM agents
      WHERE claim_token = ${token} AND is_active = TRUE
    `;

    if (result.length === 0) {
      return jsonError('Claim token not found or expired', 'TOKEN_NOT_FOUND', 404);
    }

    const agent = result[0];

    if (agent.is_claimed) {
      return jsonError('This agent has already been claimed', 'ALREADY_CLAIMED', 400);
    }

    // In a production system, you would verify the tweet here by:
    // 1. Using Twitter API to search for tweets from @cleanHandle containing verification_code
    // 2. Verifying the tweet exists and was posted recently
    // For now, we trust the user's claim (self-attestation model)

    // Update the agent as claimed
    await sql`
      UPDATE agents
      SET
        is_claimed = TRUE,
        claimed_at = NOW(),
        owner_x_handle = ${cleanHandle},
        owner_x_name = ${x_name || null},
        claim_token = NULL,
        verification_code = NULL
      WHERE id = ${agent.id}
    `;

    return jsonSuccess({
      message: 'Agent successfully claimed!',
      agent: {
        name: agent.name,
        owner_x_handle: cleanHandle
      }
    });

  } catch (error) {
    console.error('Claim verification error:', error);
    return jsonError('Failed to verify claim', 'VERIFICATION_FAILED', 500);
  }
}
