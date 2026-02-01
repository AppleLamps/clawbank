import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Get interest projections
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    // Get all active accounts with their balances and rates
    const accounts = await sql`
      SELECT
        id, type, nickname, balance, interest_rate,
        cd_maturity_date, cd_auto_renew
      FROM accounts
      WHERE agent_id = ${auth.agent.id} AND status = 'active'
    `;

    const now = new Date();
    const projections = {
      one_month: 0,
      three_months: 0,
      six_months: 0,
      twelve_months: 0
    };

    const accountProjections = accounts.map((account: any) => {
      const balance = parseFloat(account.balance);
      const annualRate = parseFloat(account.interest_rate);
      const monthlyRate = annualRate / 12;

      // For CDs, check maturity
      let maturityDate = account.cd_maturity_date ? new Date(account.cd_maturity_date) : null;
      let monthsToMaturity = maturityDate
        ? Math.max(0, (maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : null;

      // Calculate interest for each period
      const calcInterest = (months: number) => {
        if (account.type === 'cd' && maturityDate) {
          // CD only earns interest until maturity (unless auto-renew)
          if (account.cd_auto_renew) {
            // Continues earning at same rate
            return balance * monthlyRate * months;
          } else {
            // Only earns until maturity
            const effectiveMonths = Math.min(months, monthsToMaturity || months);
            return balance * monthlyRate * effectiveMonths;
          }
        }
        // Regular accounts compound monthly (simplified as simple interest for projection)
        return balance * monthlyRate * months;
      };

      const oneMonth = calcInterest(1);
      const threeMonths = calcInterest(3);
      const sixMonths = calcInterest(6);
      const twelveMonths = calcInterest(12);

      projections.one_month += oneMonth;
      projections.three_months += threeMonths;
      projections.six_months += sixMonths;
      projections.twelve_months += twelveMonths;

      return {
        account_id: account.id,
        type: account.type,
        nickname: account.nickname,
        current_balance: balance,
        interest_rate: annualRate,
        projected_interest: {
          one_month: Math.round(oneMonth * 100) / 100,
          three_months: Math.round(threeMonths * 100) / 100,
          six_months: Math.round(sixMonths * 100) / 100,
          twelve_months: Math.round(twelveMonths * 100) / 100
        },
        cd_maturity: maturityDate ? {
          date: maturityDate.toISOString().split('T')[0],
          months_remaining: Math.round((monthsToMaturity || 0) * 10) / 10,
          auto_renew: account.cd_auto_renew
        } : null
      };
    });

    // Get total current balance
    const totalBalance = accounts.reduce((sum: number, acc: any) => sum + parseFloat(acc.balance), 0);

    return jsonSuccess({
      current_total_balance: totalBalance,
      projected_interest: {
        one_month: Math.round(projections.one_month * 100) / 100,
        three_months: Math.round(projections.three_months * 100) / 100,
        six_months: Math.round(projections.six_months * 100) / 100,
        twelve_months: Math.round(projections.twelve_months * 100) / 100
      },
      projected_balance: {
        one_month: Math.round((totalBalance + projections.one_month) * 100) / 100,
        three_months: Math.round((totalBalance + projections.three_months) * 100) / 100,
        six_months: Math.round((totalBalance + projections.six_months) * 100) / 100,
        twelve_months: Math.round((totalBalance + projections.twelve_months) * 100) / 100
      },
      by_account: accountProjections,
      note: 'Projections assume current balances remain constant and use simple interest calculation. Actual results may vary.'
    });

  } catch (error) {
    console.error('Projections error:', error);
    return jsonError('Failed to calculate projections', 'PROJECTION_FAILED', 500);
  }
}
