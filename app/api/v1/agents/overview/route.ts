import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

function getActivityStatus(lastActive: Date | string | null) {
  if (!lastActive) {
    return { status: 'unknown', label: 'No activity yet' };
  }

  const lastActiveDate = new Date(lastActive);
  const now = new Date();
  const hoursAgo = Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60));

  if (hoursAgo < 1) return { status: 'active', label: 'Active now', hoursAgo };
  if (hoursAgo < 24) return { status: 'active', label: `Active ${hoursAgo} hours ago`, hoursAgo };
  if (hoursAgo < 168) return { status: 'idle', label: `Active ${Math.floor(hoursAgo / 24)} days ago`, hoursAgo };
  return { status: 'dormant', label: 'Inactive', hoursAgo };
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const transactionType = searchParams.get('transaction_type');
    const parsedLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 1), 100);

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Agent name is required (use ?name=AgentName)' },
        { status: 400 },
      );
    }

    const agents = await sql`
      SELECT id, name, description, is_claimed, is_active, created_at, claimed_at, last_active
      FROM agents
      WHERE LOWER(name) = LOWER(${name})
    `;

    if (agents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 },
      );
    }

    const agent = agents[0];
    const activity = getActivityStatus(agent.last_active);

    const accounts = await sql`
      SELECT
        id,
        type,
        nickname,
        balance,
        interest_rate,
        cd_term_months,
        cd_maturity_date,
        cd_auto_renew,
        total_interest_earned,
        status,
        created_at
      FROM accounts
      WHERE agent_id = ${agent.id}
        AND status = 'active'
      ORDER BY created_at DESC
    `;

    let transactions;
    if (transactionType) {
      transactions = await sql`
        SELECT
          t.id,
          t.type,
          t.amount,
          t.memo,
          t.created_at,
          t.counterparty_agent_name,
          t.balance_after,
          a.type as account_type
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.agent_id = ${agent.id}
          AND t.type = ${transactionType}
        ORDER BY t.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      transactions = await sql`
        SELECT
          t.id,
          t.type,
          t.amount,
          t.memo,
          t.created_at,
          t.counterparty_agent_name,
          t.balance_after,
          a.type as account_type
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.agent_id = ${agent.id}
        ORDER BY t.created_at DESC
        LIMIT ${limit}
      `;
    }

    const transfersIn = await sql`
      SELECT t.id, t.amount, t.created_at, t.counterparty_agent_name
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.agent_id = ${agent.id}
        AND t.type = 'transfer_in'
      ORDER BY t.created_at DESC
      LIMIT 20
    `;

    const transfersOut = await sql`
      SELECT t.id, t.amount, t.created_at, t.counterparty_agent_name
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.agent_id = ${agent.id}
        AND t.type = 'transfer_out'
      ORDER BY t.created_at DESC
      LIMIT 20
    `;

    const donationsGiven = await sql`
      SELECT d.id, d.amount, d.message, d.created_at, d.to_agent_id,
        COALESCE(a.name, d.to_name) as recipient_name
      FROM donations d
      LEFT JOIN agents a ON d.to_agent_id = a.id
      WHERE d.from_agent_id = ${agent.id}
      ORDER BY d.created_at DESC
      LIMIT 20
    `;

    const donationsReceived = await sql`
      SELECT d.id, d.amount, d.message, d.created_at,
        a.name as sender_name
      FROM donations d
      JOIN agents a ON d.from_agent_id = a.id
      WHERE d.to_agent_id = ${agent.id}
      ORDER BY d.created_at DESC
      LIMIT 20
    `;

    const goals = await sql`
      SELECT id, name, target_amount, current_amount, target_date, status
      FROM goals
      WHERE agent_id = ${agent.id}
      ORDER BY created_at DESC
    `;

    const totalBalance = accounts.reduce((sum: number, account: any) => sum + parseFloat(account.balance), 0);
    const totalInterest = accounts.reduce((sum: number, account: any) => sum + parseFloat(account.total_interest_earned), 0);

    const breakdown = accounts.reduce((acc: Record<string, number>, account: any) => {
      const key = account.type as string;
      acc[key] = (acc[key] || 0) + parseFloat(account.balance);
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      profile: {
        name: agent.name,
        description: agent.description,
        is_claimed: agent.is_claimed,
        is_active: agent.is_active,
        created_at: agent.created_at,
        claimed_at: agent.claimed_at,
        last_active_at: agent.last_active,
        activity_status: activity.label,
        activity_state: activity.status,
        profile_url: `/agents/${encodeURIComponent(agent.name)}`,
      },
      finances: {
        total_balance: totalBalance,
        total_interest_earned: totalInterest,
        breakdown,
      },
      accounts: accounts.map((account: any) => ({
        id: account.id,
        type: account.type,
        nickname: account.nickname,
        balance: parseFloat(account.balance),
        interest_rate: parseFloat(account.interest_rate),
        total_interest_earned: parseFloat(account.total_interest_earned),
        status: account.status,
        created_at: account.created_at,
        cd_term_months: account.cd_term_months,
        cd_maturity_date: account.cd_maturity_date,
        cd_auto_renew: account.cd_auto_renew,
      })),
      cds: accounts
        .filter((account: any) => account.type === 'cd')
        .map((account: any) => ({
          id: account.id,
          nickname: account.nickname,
          balance: parseFloat(account.balance),
          term_months: account.cd_term_months,
          maturity_date: account.cd_maturity_date,
          auto_renew: account.cd_auto_renew,
        })),
      transactions: transactions.map((transaction: any) => ({
        id: transaction.id,
        type: transaction.type,
        amount: parseFloat(transaction.amount),
        memo: transaction.memo,
        created_at: transaction.created_at,
        counterparty_agent_name: transaction.counterparty_agent_name,
        account_type: transaction.account_type,
        balance_after: parseFloat(transaction.balance_after),
      })),
      transfers: {
        incoming: transfersIn.map((transfer: any) => ({
          id: transfer.id,
          amount: parseFloat(transfer.amount),
          created_at: transfer.created_at,
          counterparty_agent_name: transfer.counterparty_agent_name,
        })),
        outgoing: transfersOut.map((transfer: any) => ({
          id: transfer.id,
          amount: parseFloat(transfer.amount),
          created_at: transfer.created_at,
          counterparty_agent_name: transfer.counterparty_agent_name,
        })),
      },
      donations: {
        given: donationsGiven.map((donation: any) => ({
          id: donation.id,
          amount: parseFloat(donation.amount),
          created_at: donation.created_at,
          message: donation.message,
          recipient_name: donation.recipient_name,
          recipient_is_agent: Boolean(donation.to_agent_id),
        })),
        received: donationsReceived.map((donation: any) => ({
          id: donation.id,
          amount: parseFloat(donation.amount),
          created_at: donation.created_at,
          message: donation.message,
          sender_name: donation.sender_name,
        })),
      },
      goals: goals.map((goal: any) => ({
        id: goal.id,
        name: goal.name,
        target_amount: parseFloat(goal.target_amount),
        current_amount: parseFloat(goal.current_amount),
        target_date: goal.target_date,
        status: goal.status,
      })),
    });
  } catch (error) {
    console.error('Agent overview error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent overview' },
      { status: 500 },
    );
  }
}
