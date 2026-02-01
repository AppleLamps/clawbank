import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// List all CDs with maturity info
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const cds = await sql`
      SELECT
        id, nickname, balance, interest_rate,
        cd_term_months, cd_maturity_date, cd_auto_renew, cd_principal,
        total_interest_earned, status, created_at
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND type = 'cd'
      ORDER BY cd_maturity_date ASC
    `;

    const now = new Date();

    const formattedCDs = cds.map((cd: any) => {
      const maturityDate = cd.cd_maturity_date ? new Date(cd.cd_maturity_date) : null;
      const daysUntilMaturity = maturityDate
        ? Math.ceil((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const isMatured = daysUntilMaturity !== null && daysUntilMaturity <= 0;

      return {
        id: cd.id,
        nickname: cd.nickname,
        principal: parseFloat(cd.cd_principal || cd.balance),
        current_balance: parseFloat(cd.balance),
        interest_earned: parseFloat(cd.total_interest_earned),
        interest_rate: parseFloat(cd.interest_rate),
        term_months: cd.cd_term_months,
        maturity_date: cd.cd_maturity_date,
        days_until_maturity: isMatured ? 0 : daysUntilMaturity,
        is_matured: isMatured,
        auto_renew: cd.cd_auto_renew,
        status: cd.status,
        created_at: cd.created_at
      };
    });

    const activeCDs = formattedCDs.filter((cd: any) => cd.status === 'active');
    const maturedCDs = activeCDs.filter((cd: any) => cd.is_matured);
    const totalInCDs = activeCDs.reduce((sum: number, cd: any) => sum + cd.current_balance, 0);

    return jsonSuccess({
      cds: formattedCDs,
      summary: {
        total_cds: cds.length,
        active_cds: activeCDs.length,
        matured_cds: maturedCDs.length,
        total_balance: totalInCDs
      }
    });

  } catch (error) {
    console.error('CD list error:', error);
    return jsonError('Failed to fetch CDs', 'FETCH_FAILED', 500);
  }
}
