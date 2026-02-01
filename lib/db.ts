import { neon, neonConfig, NeonQueryFunction } from "@neondatabase/serverless";

// Enable HTTP transaction support
neonConfig.fetchConnectionCache = true;
import { randomBytes, createHash } from "crypto";

// Lazy initialization to avoid build-time errors
let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Export a proxy that lazily initializes the connection
export const sql = new Proxy({} as NeonQueryFunction<false, false>, {
  apply(_target, _thisArg, args) {
    return getSql()(args[0] as TemplateStringsArray, ...args.slice(1));
  },
  get(_target, prop) {
    return (getSql() as any)[prop];
  },
}) as NeonQueryFunction<false, false>;

// Transaction helper for atomic operations
// Usage: await withTransaction(async (tx) => { await tx`...`; await tx`...`; });
export async function withTransaction<T>(
  callback: (tx: NeonQueryFunction<false, false>) => Promise<T>
): Promise<T> {
  const dbSql = getSql();
  await dbSql`BEGIN`;
  try {
    const result = await callback(dbSql);
    await dbSql`COMMIT`;
    return result;
  } catch (error) {
    await dbSql`ROLLBACK`;
    throw error;
  }
}

// Types
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  api_key: string;
  claim_token: string | null;
  verification_code: string | null;
  is_claimed: boolean;
  is_active: boolean;
  owner_x_handle: string | null;
  owner_x_name: string | null;
  owner_x_avatar: string | null;
  metadata: Record<string, any>;
  created_at: Date;
  claimed_at: Date | null;
  last_active: Date;
}

export interface Account {
  id: string;
  agent_id: string;
  type: "checking" | "savings" | "money_market" | "cd";
  nickname: string | null;
  balance: number;
  interest_rate: number;
  cd_term_months: number | null;
  cd_maturity_date: Date | null;
  cd_auto_renew: boolean;
  cd_principal: number | null;
  withdrawals_this_month: number;
  withdrawal_limit: number | null;
  status: "active" | "closed" | "frozen";
  interest_accrued: number;
  total_interest_earned: number;
  last_interest_credit: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: string;
  account_id: string;
  related_account_id: string | null;
  type:
    | "deposit"
    | "withdrawal"
    | "transfer_in"
    | "transfer_out"
    | "interest"
    | "cd_maturity"
    | "cd_early_withdrawal"
    | "donation"
    | "welcome_bonus";
  amount: number;
  balance_after: number;
  counterparty_agent_id: string | null;
  counterparty_agent_name: string | null;
  memo: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface PaymentRequest {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  amount: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  created_at: Date;
  responded_at: Date | null;
  expires_at: Date;
}

export interface Goal {
  id: string;
  agent_id: string;
  linked_account_id: string | null;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: Date | null;
  status: "active" | "completed" | "cancelled";
  created_at: Date;
  completed_at: Date | null;
}

// Interest rates configuration
export const INTEREST_RATES = {
  checking: 0.005, // 0.5% APY
  savings: 0.035, // 3.5% APY
  money_market: 0.045, // 4.5% APY
  cd_3: 0.05, // 5.0% APY
  cd_6: 0.055, // 5.5% APY
  cd_12: 0.06, // 6.0% APY
};

export const WITHDRAWAL_LIMITS = {
  checking: null, // Unlimited
  savings: 6, // 6 per month
  money_market: 3, // 3 per month
  cd: 0, // None until maturity
};

export const MIN_BALANCES = {
  checking: 0,
  savings: 100,
  money_market: 2500,
  cd: 500,
};

export const WELCOME_BONUS = 10000.0;

// Cryptographically secure random string generator
function secureRandomString(length: number, charset: string): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

const ALPHANUMERIC =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Helper to generate API keys (cryptographically secure)
export function generateApiKey(): string {
  return "agentbank_" + secureRandomString(32, ALPHANUMERIC);
}

// Helper to generate claim tokens (cryptographically secure)
export function generateClaimToken(): string {
  return secureRandomString(24, ALPHANUMERIC);
}

// Helper to generate verification codes (cryptographically secure)
export function generateVerificationCode(): string {
  const words = ["BANK", "CASH", "SAVE", "FUND", "GOLD", "COIN"];
  const bytes = randomBytes(5);
  const word = words[bytes[0] % words.length];
  const code = secureRandomString(4, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  return `${word}-${code}`;
}

// Hash an API key for storage (SHA-256)
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

// Verify an API key against a hash
export function verifyApiKey(apiKey: string, hash: string): boolean {
  return hashApiKey(apiKey) === hash;
}

// Get CD interest rate by term
export function getCDRate(termMonths: number): number {
  switch (termMonths) {
    case 3:
      return INTEREST_RATES.cd_3;
    case 6:
      return INTEREST_RATES.cd_6;
    case 12:
      return INTEREST_RATES.cd_12;
    default:
      throw new Error("Invalid CD term. Must be 3, 6, or 12 months.");
  }
}
