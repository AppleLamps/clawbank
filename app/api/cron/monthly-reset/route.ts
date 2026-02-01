import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateCron, jsonError, jsonSuccess } from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!authenticateCron(request)) {
    return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    // Get count of accounts that will be reset before executing
    const beforeReset = await sql`
      SELECT COUNT(*) as count
      FROM accounts
      WHERE DATE_TRUNC('month', last_withdrawal_reset) < DATE_TRUNC('month', NOW())
        AND withdrawal_limit IS NOT NULL
    `;

    // Call the stored procedure to reset monthly withdrawal counters
    await sql`SELECT reset_monthly_withdrawals()`;

    return jsonSuccess({
      message: 'Monthly withdrawal counters reset successfully',
      accounts_reset: parseInt(beforeReset[0]?.count || '0'),
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Monthly reset cron error:', error);
    return jsonError('Failed to reset monthly withdrawals', 'CRON_FAILED', 500);
  }
}

// Also support GET for manual testing and Vercel cron
export async function GET(request: NextRequest) {
  return POST(request);
}
