import { vi } from 'vitest';

// Factory function to create mock agents
export const mockAgentFactory = (overrides: Partial<MockAgent> = {}): MockAgent => ({
  id: 'agent-123',
  name: 'TestAgent',
  description: 'Test agent description',
  api_key: 'agentbank_testkey12345678901234567890ab',
  claim_token: 'claim123456789012345678',
  verification_code: 'BANK-ABC1',
  is_claimed: false,
  is_active: true,
  owner_x_handle: null,
  owner_x_name: null,
  owner_x_avatar: null,
  metadata: {},
  created_at: new Date('2024-01-01T00:00:00Z'),
  claimed_at: null,
  last_active: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

// Factory function to create mock accounts
export const mockAccountFactory = (overrides: Partial<MockAccount> = {}): MockAccount => ({
  id: 'account-123',
  agent_id: 'agent-123',
  type: 'checking',
  nickname: 'Primary Checking',
  balance: '10000.00',
  interest_rate: '0.005',
  cd_term_months: null,
  cd_maturity_date: null,
  cd_auto_renew: false,
  cd_principal: null,
  withdrawals_this_month: 0,
  withdrawal_limit: null,
  status: 'active',
  interest_accrued: '0',
  total_interest_earned: '0',
  last_interest_credit: new Date('2024-01-01T00:00:00Z'),
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
  closed_at: null,
  ...overrides,
});

// Factory function to create mock transactions
export const mockTransactionFactory = (overrides: Partial<MockTransaction> = {}): MockTransaction => ({
  id: 'txn-123',
  account_id: 'account-123',
  related_account_id: null,
  type: 'deposit',
  amount: '100.00',
  balance_after: '10100.00',
  counterparty_agent_id: null,
  counterparty_agent_name: null,
  memo: null,
  metadata: {},
  created_at: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

// Factory function to create mock payment requests
export const mockPaymentRequestFactory = (overrides: Partial<MockPaymentRequest> = {}): MockPaymentRequest => ({
  id: 'req-123',
  from_agent_id: 'agent-456',
  to_agent_id: 'agent-123',
  amount: '100.00',
  reason: 'Test payment request',
  status: 'pending',
  created_at: new Date('2024-01-01T00:00:00Z'),
  responded_at: null,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  ...overrides,
});

// Factory function to create mock goals
export const mockGoalFactory = (overrides: Partial<MockGoal> = {}): MockGoal => ({
  id: 'goal-123',
  agent_id: 'agent-123',
  linked_account_id: null,
  name: 'Test Goal',
  target_amount: '5000.00',
  current_amount: '1000.00',
  target_date: null,
  status: 'active',
  created_at: new Date('2024-01-01T00:00:00Z'),
  completed_at: null,
  ...overrides,
});

// Type definitions for mocks
export interface MockAgent {
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
  metadata: Record<string, unknown>;
  created_at: Date;
  claimed_at: Date | null;
  last_active: Date;
}

export interface MockAccount {
  id: string;
  agent_id: string;
  type: 'checking' | 'savings' | 'money_market' | 'cd';
  nickname: string | null;
  balance: string;
  interest_rate: string;
  cd_term_months: number | null;
  cd_maturity_date: Date | null;
  cd_auto_renew: boolean;
  cd_principal: string | null;
  withdrawals_this_month: number;
  withdrawal_limit: number | null;
  status: 'active' | 'closed' | 'frozen';
  interest_accrued: string;
  total_interest_earned: string;
  last_interest_credit: Date;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

export interface MockTransaction {
  id: string;
  account_id: string;
  related_account_id: string | null;
  type: string;
  amount: string;
  balance_after: string;
  counterparty_agent_id: string | null;
  counterparty_agent_name: string | null;
  memo: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface MockPaymentRequest {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  amount: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  created_at: Date;
  responded_at: Date | null;
  expires_at: Date;
}

export interface MockGoal {
  id: string;
  agent_id: string;
  linked_account_id: string | null;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: Date | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: Date;
  completed_at: Date | null;
}

// Create a mock SQL function that can be configured per test
export function createMockSql() {
  const mockFn = vi.fn();

  return {
    sql: mockFn,
    mockResolvedValue: (value: unknown[]) => {
      mockFn.mockResolvedValue(value);
    },
    mockResolvedValueOnce: (value: unknown[]) => {
      mockFn.mockResolvedValueOnce(value);
    },
    mockRejectedValue: (error: Error) => {
      mockFn.mockRejectedValue(error);
    },
    reset: () => {
      mockFn.mockReset();
    },
  };
}
