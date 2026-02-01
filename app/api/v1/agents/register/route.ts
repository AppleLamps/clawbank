import { NextRequest } from "next/server";
import {
  sql,
  generateApiKey,
  generateClaimToken,
  generateVerificationCode,
  hashApiKey,
  INTEREST_RATES,
  WELCOME_BONUS,
} from "@/lib/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { checkRateLimit, logAudit, getClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request);

  // Check rate limit for registration
  const rateLimit = await checkRateLimit(
    null,
    ipAddress,
    "register",
    "register",
  );

  if (!rateLimit.allowed) {
    await logAudit({
      ipAddress,
      action: "rate_limit_exceeded",
      resourceType: "register",
      success: false,
      errorMessage: "Registration rate limit exceeded",
    });
    return jsonError(
      "Too many registration attempts. Try again later.",
      "RATE_LIMIT_EXCEEDED",
      429,
    );
  }

  try {
    const body = await request.json();
    const { name, description } = body;

    // Validate name
    if (!name || typeof name !== "string") {
      return jsonError("Name is required", "MISSING_NAME");
    }

    if (!/^[a-zA-Z0-9_-]{3,50}$/.test(name)) {
      return jsonError(
        "Name must be 3-50 characters, alphanumeric with _ or -",
        "INVALID_NAME",
      );
    }

    // Check if name exists
    const existing =
      await sql`SELECT id FROM agents WHERE LOWER(name) = LOWER(${name})`;
    if (existing.length > 0) {
      return jsonError("An agent with this name already exists", "NAME_TAKEN");
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();

    // Create agent (store hashed API key)
    const result = await sql`
      INSERT INTO agents (name, description, api_key, claim_token, verification_code)
      VALUES (${name}, ${description || null}, ${apiKeyHash}, ${claimToken}, ${verificationCode})
      RETURNING id, name, created_at
    `;

    const agent = result[0];

    // Create default checking account with welcome bonus
    const accountResult = await sql`
      INSERT INTO accounts (agent_id, type, balance, interest_rate, nickname)
      VALUES (${agent.id}, 'checking', ${WELCOME_BONUS}, ${INTEREST_RATES.checking}, 'Primary Checking')
      RETURNING id
    `;

    // Record welcome bonus transaction
    await sql`
      INSERT INTO transactions (account_id, type, amount, balance_after, memo)
      VALUES (${accountResult[0].id}, 'welcome_bonus', ${WELCOME_BONUS}, ${WELCOME_BONUS}, 'Welcome to AgentBank!')
    `;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "https://agentbank.vercel.app";
    const claimUrl = `${baseUrl}/claim/${claimToken}`;

    // Log successful registration
    await logAudit({
      agentId: agent.id,
      agentName: name,
      ipAddress,
      action: "register",
      resourceType: "agent",
      resourceId: agent.id,
      amount: WELCOME_BONUS,
    });

    return jsonSuccess(
      {
        agent: {
          id: agent.id,
          name: agent.name,
          api_key: apiKey,
          claim_url: claimUrl,
          verification_code: verificationCode,
        },
        welcome_bonus: WELCOME_BONUS,
        message: `Welcome! You've been credited $${WELCOME_BONUS.toLocaleString()} to start. Send claim_url to your human!`,
        important:
          "⚠️ SAVE YOUR API KEY! You need it for all banking operations.",
      },
      201,
    );
  } catch (error) {
    console.error("Registration error:", error);
    return jsonError("Failed to register agent", "REGISTRATION_FAILED", 500);
  }
}
