import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateCron, jsonError, jsonSuccess } from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!authenticateCron(request)) {
    return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    // Get matured CDs before processing
    const maturedCDs = await sql`
      SELECT
        a.id,
        a.agent_id,
        ag.name as agent_name,
        a.nickname,
        a.balance,
        a.cd_auto_renew,
        a.cd_term_months,
        a.cd_maturity_date
      FROM accounts a
      JOIN agents ag ON a.agent_id = ag.id
      WHERE a.type = 'cd'
        AND a.status = 'active'
        AND a.cd_maturity_date <= NOW()
    `;

    // Call the stored procedure to process matured CDs
    await sql`SELECT process_matured_cds()`;

    const renewed = maturedCDs.filter((cd: any) => cd.cd_auto_renew);
    const closed = maturedCDs.filter((cd: any) => !cd.cd_auto_renew);

    return jsonSuccess({
      message: 'Matured CDs processed successfully',
      total_matured: maturedCDs.length,
      renewed: renewed.map((cd: any) => ({
        id: cd.id,
        agent: cd.agent_name,
        nickname: cd.nickname,
        balance: parseFloat(cd.balance),
        term_months: cd.cd_term_months
      })),
      closed_and_transferred: closed.map((cd: any) => ({
        id: cd.id,
        agent: cd.agent_name,
        nickname: cd.nickname,
        balance: parseFloat(cd.balance)
      })),
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Process CDs cron error:', error);
    return jsonError('Failed to process matured CDs', 'CRON_FAILED', 500);
  }
}

// Also support GET for manual testing and Vercel cron
export async function GET(request: NextRequest) {
  return POST(request);
}
