import { NextRequest } from "next/server";
import { sql } from "./db";

// Rate limit configuration
export const RATE_LIMITS = {
  default: { requests: 100, windowMs: 60000 }, // 100 per minute
  transfer: { requests: 10, windowMs: 3600000 }, // 10 per hour
  register: { requests: 3, windowMs: 60000 }, // 3 per minute
  account_create: { requests: 5, windowMs: 60000 }, // 5 per minute
};

export type RateLimitType = keyof typeof RATE_LIMITS;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// Get client IP from request
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

// Check rate limit for an agent or IP
export async function checkRateLimit(
  agentId: string | null,
  ipAddress: string,
  endpoint: string,
  limitType: RateLimitType = "default"
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[limitType];
  const windowStart = new Date(Date.now() - config.windowMs);

  try {
    // Count requests in current window
    let result;
    if (agentId) {
      result = await sql`
        SELECT COUNT(*) as count
        FROM rate_limits
        WHERE agent_id = ${agentId}
          AND endpoint = ${endpoint}
          AND window_start > ${windowStart.toISOString()}
      `;
    } else {
      result = await sql`
        SELECT COUNT(*) as count
        FROM rate_limits
        WHERE ip_address = ${ipAddress}
          AND endpoint = ${endpoint}
          AND window_start > ${windowStart.toISOString()}
      `;
    }

    const currentCount = parseInt(result[0]?.count || "0");
    const allowed = currentCount < config.requests;
    const remaining = Math.max(0, config.requests - currentCount - 1);
    const resetAt = new Date(Date.now() + config.windowMs);

    // Record this request
    if (allowed) {
      await sql`
        INSERT INTO rate_limits (agent_id, ip_address, endpoint, window_start)
        VALUES (${agentId}, ${ipAddress}, ${endpoint}, NOW())
      `;
    }

    return { allowed, remaining, resetAt };
  } catch (error) {
    console.error("Rate limit check error:", error);
    // Fail closed - deny request if rate limiting fails (security best practice)
    return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + 60000) };
  }
}

// Audit log action types
export type AuditAction =
  | "register"
  | "login"
  | "transfer_out"
  | "transfer_in"
  | "deposit"
  | "withdrawal"
  | "early_withdrawal"
  | "account_create"
  | "account_close"
  | "donation"
  | "payment_request"
  | "payment_approve"
  | "payment_reject"
  | "profile_update"
  | "claim_verify"
  | "api_key_used"
  | "rate_limit_exceeded"
  | "auth_failed";

interface AuditLogEntry {
  agentId?: string | null;
  agentName?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  amount?: number;
  success?: boolean;
  errorMessage?: string;
}

// Log an audit event
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_logs (
        agent_id, agent_name, ip_address, user_agent,
        action, resource_type, resource_id,
        details, amount, success, error_message
      )
      VALUES (
        ${entry.agentId || null},
        ${entry.agentName || null},
        ${entry.ipAddress},
        ${entry.userAgent || null},
        ${entry.action},
        ${entry.resourceType || null},
        ${entry.resourceId || null},
        ${JSON.stringify(entry.details || {})},
        ${entry.amount || null},
        ${entry.success !== false},
        ${entry.errorMessage || null}
      )
    `;
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error("Audit log error:", error);
  }
}

// Helper to create audit log from request
export function createAuditEntry(
  request: NextRequest,
  action: AuditAction,
  overrides: Partial<AuditLogEntry> = {}
): AuditLogEntry {
  return {
    ipAddress: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
    action,
    success: true,
    ...overrides,
  };
}

// Cleanup old rate limit records (call from cron)
export async function cleanupRateLimits(): Promise<number> {
  try {
    const result = await sql`
      DELETE FROM rate_limits
      WHERE window_start < NOW() - INTERVAL '1 hour'
      RETURNING id
    `;
    return result.length;
  } catch (error) {
    console.error("Rate limit cleanup error:", error);
    return 0;
  }
}
