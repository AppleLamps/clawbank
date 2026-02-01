import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// List all goals
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let goals;
    if (status && ['active', 'completed', 'cancelled'].includes(status)) {
      goals = await sql`
        SELECT g.*, a.type as linked_account_type, a.nickname as linked_account_nickname
        FROM goals g
        LEFT JOIN accounts a ON g.linked_account_id = a.id
        WHERE g.agent_id = ${auth.agent.id} AND g.status = ${status}
        ORDER BY g.created_at DESC
      `;
    } else {
      goals = await sql`
        SELECT g.*, a.type as linked_account_type, a.nickname as linked_account_nickname
        FROM goals g
        LEFT JOIN accounts a ON g.linked_account_id = a.id
        WHERE g.agent_id = ${auth.agent.id}
        ORDER BY g.created_at DESC
      `;
    }

    const formattedGoals = goals.map((goal: any) => {
      const targetAmount = parseFloat(goal.target_amount);
      const currentAmount = parseFloat(goal.current_amount);
      const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;

      return {
        id: goal.id,
        name: goal.name,
        target_amount: targetAmount,
        current_amount: currentAmount,
        progress_percent: Math.min(progress, 100),
        target_date: goal.target_date,
        status: goal.status,
        linked_account: goal.linked_account_id ? {
          id: goal.linked_account_id,
          type: goal.linked_account_type,
          nickname: goal.linked_account_nickname
        } : null,
        created_at: goal.created_at,
        completed_at: goal.completed_at
      };
    });

    const activeGoals = formattedGoals.filter((g: any) => g.status === 'active');
    const completedGoals = formattedGoals.filter((g: any) => g.status === 'completed');

    return jsonSuccess({
      goals: formattedGoals,
      summary: {
        total: goals.length,
        active: activeGoals.length,
        completed: completedGoals.length
      }
    });

  } catch (error) {
    console.error('Goals fetch error:', error);
    return jsonError('Failed to fetch goals', 'FETCH_FAILED', 500);
  }
}

// Create a new goal
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  try {
    const body = await request.json();
    const { name, target_amount, target_date, linked_account_id } = body;

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return jsonError('Goal name is required', 'MISSING_NAME');
    }

    if (name.length > 100) {
      return jsonError('Goal name must be 100 characters or less', 'NAME_TOO_LONG');
    }

    // Validate target amount
    if (!target_amount || target_amount <= 0) {
      return jsonError('Target amount must be positive', 'INVALID_AMOUNT');
    }

    // Validate linked account if provided
    if (linked_account_id) {
      const accounts = await sql`
        SELECT id FROM accounts
        WHERE id = ${linked_account_id} AND agent_id = ${auth.agent.id} AND status = 'active'
      `;

      if (accounts.length === 0) {
        return jsonError('Linked account not found or not active', 'ACCOUNT_NOT_FOUND');
      }
    }

    // Validate target date if provided
    let parsedDate = null;
    if (target_date) {
      parsedDate = new Date(target_date);
      if (isNaN(parsedDate.getTime())) {
        return jsonError('Invalid target date format', 'INVALID_DATE');
      }
      if (parsedDate <= new Date()) {
        return jsonError('Target date must be in the future', 'DATE_IN_PAST');
      }
    }

    const result = await sql`
      INSERT INTO goals (agent_id, name, target_amount, target_date, linked_account_id)
      VALUES (${auth.agent.id}, ${name.trim()}, ${target_amount}, ${parsedDate}, ${linked_account_id || null})
      RETURNING id, name, target_amount, current_amount, target_date, status, created_at
    `;

    const goal = result[0];

    return jsonSuccess({
      goal: {
        id: goal.id,
        name: goal.name,
        target_amount: parseFloat(goal.target_amount),
        current_amount: parseFloat(goal.current_amount),
        progress_percent: 0,
        target_date: goal.target_date,
        status: goal.status,
        created_at: goal.created_at
      },
      message: `Goal "${goal.name}" created! Target: $${parseFloat(goal.target_amount).toFixed(2)}`
    }, 201);

  } catch (error) {
    console.error('Goal creation error:', error);
    return jsonError('Failed to create goal', 'CREATION_FAILED', 500);
  }
}
