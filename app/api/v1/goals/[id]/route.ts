import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { authenticateAgent, jsonError, jsonSuccess } from '@/lib/auth';

// Update goal
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || 'Unauthorized', 'UNAUTHORIZED', 401);
  }

  const { id } = await params;

  try {
    // Get goal, verify ownership
    const goals = await sql`
      SELECT id, name, target_amount, current_amount, status
      FROM goals
      WHERE id = ${id} AND agent_id = ${auth.agent.id}
    `;

    if (goals.length === 0) {
      return jsonError('Goal not found', 'GOAL_NOT_FOUND', 404);
    }

    const goal = goals[0];
    const body = await request.json();
    const { name, current_amount, status } = body;

    // Build update
    const updates: string[] = [];
    let newStatus = goal.status;
    let newCurrentAmount = parseFloat(goal.current_amount);
    const targetAmount = parseFloat(goal.target_amount);

    // Update name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return jsonError('Goal name cannot be empty', 'INVALID_NAME');
      }
      if (name.length > 100) {
        return jsonError('Goal name must be 100 characters or less', 'NAME_TOO_LONG');
      }
      await sql`UPDATE goals SET name = ${name.trim()} WHERE id = ${id}`;
    }

    // Update current_amount if provided
    if (current_amount !== undefined) {
      if (current_amount < 0) {
        return jsonError('Current amount cannot be negative', 'INVALID_AMOUNT');
      }
      if (current_amount > targetAmount) {
        return jsonError('Current amount cannot exceed target amount', 'EXCEEDS_TARGET');
      }
      newCurrentAmount = current_amount;
      await sql`UPDATE goals SET current_amount = ${current_amount} WHERE id = ${id}`;

      // Auto-complete if target reached
      if (current_amount >= targetAmount && goal.status === 'active') {
        newStatus = 'completed';
        await sql`UPDATE goals SET status = 'completed', completed_at = NOW() WHERE id = ${id}`;
      }
    }

    // Update status if provided
    if (status !== undefined) {
      if (!['active', 'completed', 'cancelled'].includes(status)) {
        return jsonError('Invalid status. Must be: active, completed, or cancelled', 'INVALID_STATUS');
      }

      // Don't allow reactivating completed/cancelled goals
      if (goal.status !== 'active' && status === 'active') {
        return jsonError('Cannot reactivate a completed or cancelled goal', 'CANNOT_REACTIVATE');
      }

      newStatus = status;
      if (status === 'completed') {
        await sql`UPDATE goals SET status = 'completed', completed_at = NOW() WHERE id = ${id}`;
      } else if (status === 'cancelled') {
        await sql`UPDATE goals SET status = 'cancelled' WHERE id = ${id}`;
      }
    }

    // Fetch updated goal
    const updatedGoals = await sql`
      SELECT id, name, target_amount, current_amount, target_date, status, created_at, completed_at
      FROM goals WHERE id = ${id}
    `;

    const updated = updatedGoals[0];
    const progress = targetAmount > 0 ? (parseFloat(updated.current_amount) / targetAmount) * 100 : 0;

    return jsonSuccess({
      goal: {
        id: updated.id,
        name: updated.name,
        target_amount: parseFloat(updated.target_amount),
        current_amount: parseFloat(updated.current_amount),
        progress_percent: Math.min(progress, 100),
        target_date: updated.target_date,
        status: updated.status,
        created_at: updated.created_at,
        completed_at: updated.completed_at
      },
      message: updated.status === 'completed'
        ? `Congratulations! Goal "${updated.name}" completed!`
        : 'Goal updated successfully'
    });

  } catch (error) {
    console.error('Goal update error:', error);
    return jsonError('Failed to update goal', 'UPDATE_FAILED', 500);
  }
}
