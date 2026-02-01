import { NextRequest } from 'next/server';
import { sql, INTEREST_RATES, MIN_BALANCES, WITHDRAWAL_LIMITS, getCDRate } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  const accounts = await sql`
    SELECT 
      id, type, nickname, balance, interest_rate,
      cd_term_months, cd_maturity_date, cd_auto_renew, cd_principal,
      withdrawals_this_month, withdrawal_limit,
      total_interest_earned, status, created_at
    FROM accounts 
    WHERE agent_id = ${auth.agent.id} AND status = 'active'
    ORDER BY created_at ASC
  `;
  
  const totals = await sql`
    SELECT 
      COALESCE(SUM(balance), 0) as total_balance,
      COALESCE(SUM(total_interest_earned), 0) as total_interest
    FROM accounts 
    WHERE agent_id = ${auth.agent.id} AND status = 'active'
  `;
  
  return jsonSuccess({
    accounts: accounts.map((acc: any) => ({
      ...acc,
      balance: parseFloat(acc.balance),
      interest_rate: parseFloat(acc.interest_rate),
      total_interest_earned: parseFloat(acc.total_interest_earned),
      cd_principal: acc.cd_principal ? parseFloat(acc.cd_principal) : null
    })),
    total_balance: parseFloat(totals[0]?.total_balance || '0'),
    total_interest_earned: parseFloat(totals[0]?.total_interest || '0')
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }
  
  try {
    const body = await request.json();
    const { type, initial_deposit, nickname, term_months } = body;
    
    // Validate account type
    if (!['checking', 'savings', 'money_market', 'cd'].includes(type)) {
      return jsonError('Invalid account type. Must be: checking, savings, money_market, or cd', 'INVALID_TYPE');
    }
    
    // Get interest rate
    let interestRate: number;
    let cdMaturityDate: Date | null = null;
    let cdTermMonths: number | null = null;
    
    if (type === 'cd') {
      if (![3, 6, 12].includes(term_months)) {
        return jsonError('CD term must be 3, 6, or 12 months', 'INVALID_CD_TERM');
      }
      interestRate = getCDRate(term_months);
      cdTermMonths = term_months;
      cdMaturityDate = new Date();
      cdMaturityDate.setMonth(cdMaturityDate.getMonth() + term_months);
    } else {
      interestRate = INTEREST_RATES[type as keyof typeof INTEREST_RATES] as number;
    }
    
    // Check minimum balance requirement
    const minBalance = MIN_BALANCES[type as keyof typeof MIN_BALANCES];
    const deposit = initial_deposit || 0;
    
    if (deposit < minBalance) {
      return jsonError(
        `Minimum initial deposit for ${type} is $${minBalance}`, 
        'MIN_BALANCE_REQUIRED'
      );
    }
    
    // If deposit > 0, need to withdraw from checking
    if (deposit > 0) {
      const checking = await sql`
        SELECT id, balance FROM accounts 
        WHERE agent_id = ${auth.agent.id} 
          AND type = 'checking' 
          AND status = 'active'
        LIMIT 1
      `;
      
      if (checking.length === 0 || parseFloat(checking[0].balance) < deposit) {
        return jsonError('Insufficient funds in checking account', 'INSUFFICIENT_FUNDS');
      }
      
      // Deduct from checking
      await sql`
        UPDATE accounts 
        SET balance = balance - ${deposit}
        WHERE id = ${checking[0].id}
      `;
      
      // Record withdrawal transaction
      const newCheckingBalance = parseFloat(checking[0].balance) - deposit;
      await sql`
        INSERT INTO transactions (account_id, type, amount, balance_after, memo)
        VALUES (${checking[0].id}, 'withdrawal', ${deposit}, ${newCheckingBalance}, 
                ${`Transfer to new ${type} account`})
      `;
    }
    
    // Create new account
    const withdrawalLimit = WITHDRAWAL_LIMITS[type as keyof typeof WITHDRAWAL_LIMITS];
    
    const result = await sql`
      INSERT INTO accounts (
        agent_id, type, nickname, balance, interest_rate,
        cd_term_months, cd_maturity_date, cd_principal, withdrawal_limit
      )
      VALUES (
        ${auth.agent.id}, ${type}, ${nickname || null}, ${deposit}, ${interestRate},
        ${cdTermMonths}, ${cdMaturityDate}, ${type === 'cd' ? deposit : null}, ${withdrawalLimit}
      )
      RETURNING id, type, nickname, balance, interest_rate, cd_term_months, cd_maturity_date, created_at
    `;
    
    const account = result[0];
    
    // Record deposit transaction if there was an initial deposit
    if (deposit > 0) {
      await sql`
        INSERT INTO transactions (account_id, type, amount, balance_after, memo)
        VALUES (${account.id}, 'deposit', ${deposit}, ${deposit}, 'Initial deposit')
      `;
    }
    
    return jsonSuccess({
      account: {
        ...account,
        balance: parseFloat(account.balance),
        interest_rate: parseFloat(account.interest_rate)
      },
      message: type === 'cd' 
        ? `CD opened! Matures on ${cdMaturityDate?.toLocaleDateString()}. Rate: ${(interestRate * 100).toFixed(1)}% APY`
        : `${type.charAt(0).toUpperCase() + type.slice(1)} account opened successfully!`
    }, 201);
    
  } catch (error) {
    console.error('Account creation error:', error);
    return jsonError('Failed to create account', 'CREATION_FAILED', 500);
  }
}
