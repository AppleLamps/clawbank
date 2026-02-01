import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { checkRateLimit, logAudit, getClientIp } from "@/lib/security";

// Transfer to another agent
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agent) {
    return jsonError(auth.error || "Unauthorized", "UNAUTHORIZED", 401);
  }

  // Check rate limit for transfers
  const ipAddress = getClientIp(request);
  const rateLimit = await checkRateLimit(
    auth.agent.id,
    ipAddress,
    "transfer_agent",
    "transfer",
  );

  if (!rateLimit.allowed) {
    await logAudit({
      agentId: auth.agent.id,
      agentName: auth.agent.name,
      ipAddress,
      action: "rate_limit_exceeded",
      resourceType: "transfer",
      success: false,
      errorMessage: "Transfer rate limit exceeded",
    });
    return jsonError(
      "Rate limit exceeded. Max 10 transfers per hour.",
      "RATE_LIMIT_EXCEEDED",
      429,
    );
  }

  try {
    const body = await request.json();
    const { to_agent, amount, memo, from_account } = body;

    // Validate amount
    if (!amount || amount <= 0) {
      return jsonError("Amount must be positive", "INVALID_AMOUNT");
    }

    if (amount > 10000) {
      return jsonError(
        "Maximum transfer amount is $10,000 per transaction",
        "AMOUNT_TOO_LARGE",
      );
    }

    // Find recipient agent
    const recipient = await sql`
      SELECT id, name, is_claimed, is_active
      FROM agents
      WHERE LOWER(name) = LOWER(${to_agent})
    `;

    if (recipient.length === 0) {
      return jsonError("Recipient agent not found", "AGENT_NOT_FOUND");
    }

    const recipientAgent = recipient[0];

    if (!recipientAgent.is_active) {
      return jsonError("Recipient agent is not active", "AGENT_INACTIVE");
    }

    if (recipientAgent.id === auth.agent.id) {
      return jsonError(
        "Cannot transfer to yourself. Use internal transfer instead.",
        "SELF_TRANSFER",
      );
    }

    // Get sender's account
    let sourceQuery;
    if (from_account) {
      sourceQuery = sql`
        SELECT id, balance, type
        FROM accounts
        WHERE id = ${from_account}
          AND agent_id = ${auth.agent.id}
          AND status = 'active'
          AND type IN ('checking', 'savings', 'money_market')
      `;
    } else {
      // Default to checking
      sourceQuery = sql`
        SELECT id, balance, type
        FROM accounts
        WHERE agent_id = ${auth.agent.id}
          AND type = 'checking'
          AND status = 'active'
        LIMIT 1
      `;
    }

    const sourceResult = await sourceQuery;

    if (sourceResult.length === 0) {
      return jsonError(
        "Source account not found or not eligible for transfers",
        "ACCOUNT_NOT_FOUND",
      );
    }

    const sourceAccount = sourceResult[0];

    // Check balance
    if (parseFloat(sourceAccount.balance) < amount) {
      return jsonError("Insufficient funds", "INSUFFICIENT_FUNDS");
    }

    // Get recipient's checking account
    const recipientAccount = await sql`
      SELECT id, balance
      FROM accounts
      WHERE agent_id = ${recipientAgent.id}
        AND type = 'checking'
        AND status = 'active'
      LIMIT 1
    `;

    if (recipientAccount.length === 0) {
      return jsonError(
        "Recipient has no active checking account",
        "NO_RECIPIENT_ACCOUNT",
      );
    }

    const destAccount = recipientAccount[0];
    const newSourceBalance = parseFloat(sourceAccount.balance) - amount;
    const newDestBalance = parseFloat(destAccount.balance) + amount;

    // Capture agent info for use in transaction callback
    const senderAgentId = auth.agent.id;
    const senderAgentName = auth.agent.name;

    // Perform transfer atomically
    await withTransaction(async (tx) => {
      await tx`UPDATE accounts SET balance = ${newSourceBalance} WHERE id = ${sourceAccount.id}`;
      await tx`UPDATE accounts SET balance = ${newDestBalance} WHERE id = ${destAccount.id}`;

      // Record transactions
      await tx`
        INSERT INTO transactions (
          account_id, type, amount, balance_after,
          counterparty_agent_id, counterparty_agent_name, memo
        )
        VALUES (
          ${sourceAccount.id}, 'transfer_out', ${amount}, ${newSourceBalance},
          ${recipientAgent.id}, ${recipientAgent.name}, ${memo || null}
        )
      `;

      await tx`
        INSERT INTO transactions (
          account_id, type, amount, balance_after,
          counterparty_agent_id, counterparty_agent_name, memo
        )
        VALUES (
          ${destAccount.id}, 'transfer_in', ${amount}, ${newDestBalance},
          ${senderAgentId}, ${senderAgentName}, ${memo || null}
        )
      `;
    });

    // Log successful transfer
    await logAudit({
      agentId: auth.agent.id,
      agentName: auth.agent.name,
      ipAddress,
      action: "transfer_out",
      resourceType: "account",
      resourceId: sourceAccount.id,
      amount,
      details: {
        to_agent: recipientAgent.name,
        to_agent_id: recipientAgent.id,
        memo: memo || null,
      },
    });

    return jsonSuccess({
      transfer: {
        id: `txn_${Date.now()}`,
        to_agent: recipientAgent.name,
        amount,
        memo: memo || null,
        timestamp: new Date().toISOString(),
      },
      new_balance: newSourceBalance,
      message: `Sent $${amount.toFixed(2)} to ${recipientAgent.name}`,
    });
  } catch (error) {
    console.error("Agent transfer error:", error);
    return jsonError("Transfer failed", "TRANSFER_FAILED", 500);
  }
}
