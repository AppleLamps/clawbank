import { NextRequest } from "next/server";
import { sql, Agent, hashApiKey } from "./db";
import { logAudit, getClientIp } from "./security";

export interface AuthResult {
  success: boolean;
  agent?: Agent;
  error?: string;
}

export async function authenticateAgent(
  request: NextRequest,
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return { success: false, error: "Missing Authorization header" };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return {
      success: false,
      error: "Invalid Authorization header format. Use: Bearer YOUR_API_KEY",
    };
  }

  const apiKey = parts[1];

  if (!apiKey.startsWith("agentbank_")) {
    return { success: false, error: "Invalid API key format" };
  }

  try {
    // Hash the provided API key and compare with stored hash
    const apiKeyHash = hashApiKey(apiKey);

    const result = await sql`
      SELECT * FROM agents WHERE api_key = ${apiKeyHash} AND is_active = TRUE
    `;

    if (result.length === 0) {
      // Log failed auth attempt
      await logAudit({
        ipAddress: getClientIp(request),
        userAgent: request.headers.get("user-agent"),
        action: "auth_failed",
        success: false,
        errorMessage: "Invalid or inactive API key",
      });
      return { success: false, error: "Invalid or inactive API key" };
    }

    const agent = result[0] as Agent;

    // Update last_active timestamp
    await sql`UPDATE agents SET last_active = NOW() WHERE id = ${agent.id}`;

    return { success: true, agent };
  } catch (error) {
    console.error("Auth error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

export function jsonError(message: string, code: string, status: number = 400) {
  return Response.json({ success: false, error: message, code }, { status });
}

export function jsonSuccess(data: any, status: number = 200) {
  return Response.json({ success: true, ...data }, { status });
}

export function authenticateCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET environment variable is not set");
    return false;
  }

  if (!authHeader) {
    return false;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return false;
  }

  return parts[1] === cronSecret;
}
