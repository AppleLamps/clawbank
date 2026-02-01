// Re-export all mock factories for convenience
export {
  mockAgentFactory,
  mockAccountFactory,
  mockTransactionFactory,
  mockPaymentRequestFactory,
  mockGoalFactory,
  createMockSql,
  type MockAgent,
  type MockAccount,
  type MockTransaction,
  type MockPaymentRequest,
  type MockGoal,
} from '../mocks/db.mock';

export {
  createMockRequest,
  createAuthenticatedRequest,
  createCronRequest,
  getResponseBody,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiResponse,
} from '../mocks/request.mock';

// Common test data
export const TEST_API_KEY = 'agentbank_testkey12345678901234567890ab';
export const TEST_CRON_SECRET = 'test-cron-secret';
export const TEST_AGENT_ID = 'agent-123';
export const TEST_ACCOUNT_ID = 'account-123';

// Interest rates (should match lib/db.ts)
export const EXPECTED_INTEREST_RATES = {
  checking: 0.005,
  savings: 0.035,
  money_market: 0.045,
  cd_3: 0.05,
  cd_6: 0.055,
  cd_12: 0.06,
};

// Withdrawal limits (should match lib/db.ts)
export const EXPECTED_WITHDRAWAL_LIMITS = {
  checking: null,
  savings: 6,
  money_market: 3,
  cd: 0,
};

// Minimum balances (should match lib/db.ts)
export const EXPECTED_MIN_BALANCES = {
  checking: 0,
  savings: 100,
  money_market: 2500,
  cd: 500,
};

// Welcome bonus
export const EXPECTED_WELCOME_BONUS = 10000.0;
