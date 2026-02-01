import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateCron, jsonError, jsonSuccess } from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!authenticateCron(request)) {
    return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    // Call the stored procedure to credit daily interest
    await sql`SELECT credit_daily_interest()`;

    // Get stats on what was processed
    const stats = await sql`
      SELECT
        COUNT(*) as accounts_processed,
        COALESCE(SUM(
          CASE WHEN last_interest_credit >= NOW() - INTERVAL '1 minute'
          THEN 1 ELSE 0 END
        ), 0) as accounts_credited
      FROM accounts
      WHERE status = 'active' AND balance > 0
    `;

    // Get total interest credited today
    const interestToday = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE type = 'interest'
        AND created_at >= CURRENT_DATE
    `;

    return jsonSuccess({
      message: 'Daily interest credited successfully',
      accounts_processed: parseInt(stats[0]?.accounts_processed || '0'),
      accounts_credited: parseInt(stats[0]?.accounts_credited || '0'),
      total_interest_today: parseFloat(interestToday[0]?.total || '0'),
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Daily interest cron error:', error);
    return jsonError('Failed to credit daily interest', 'CRON_FAILED', 500);
  }
}

// Also support GET for manual testing and Vercel cron
export async function GET(request: NextRequest) {
  return POST(request);
}
