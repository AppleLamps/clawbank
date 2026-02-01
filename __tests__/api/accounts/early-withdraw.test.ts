import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "../../setup/mocks/request.mock";
import {
  mockAgentFactory,
  mockAccountFactory,
} from "../../setup/mocks/db.mock";

// Mock the modules - vi.hoisted ensures mocks are available when vi.mock runs
const { mockSql, mockAuthenticateAgent } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockAuthenticateAgent: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual("@/lib/db");
  return {
    ...actual,
    sql: mockSql,
  };
});

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual("@/lib/auth");
  return {
    ...actual,
    authenticateAgent: mockAuthenticateAgent,
  };
});

// Import after mocking
import { POST } from "@/app/api/v1/accounts/[id]/early-withdraw/route";

describe("POST /api/v1/accounts/[id]/early-withdraw", () => {
  const mockAgent = mockAgentFactory();
  const cdAccountId = "cd-account-123";

  beforeEach(() => {
    mockSql.mockReset();
    mockAuthenticateAgent.mockReset();
    mockAuthenticateAgent.mockResolvedValue({
      success: true,
      agent: mockAgent,
    });
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mockAuthenticateAgent.mockResolvedValueOnce({
        success: false,
        error: "Unauthorized",
      });

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        { method: "POST", body: { confirm: false } },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Validation", () => {
    it("should reject non-CD accounts", async () => {
      const savingsAccount = mockAccountFactory({
        id: cdAccountId,
        type: "savings",
        agent_id: mockAgent.id,
      });
      mockSql.mockResolvedValueOnce([savingsAccount]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: false },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("NOT_CD_ACCOUNT");
    });

    it("should reject when account not found", async () => {
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: false },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("should reject CD that has already matured", async () => {
      const maturedCD = mockAccountFactory({
        id: cdAccountId,
        type: "cd",
        agent_id: mockAgent.id,
        cd_maturity_date: new Date(Date.now() - 86400000), // 1 day ago
        cd_principal: "10000.00",
        balance: "10200.00",
        interest_rate: "0.06",
      });
      mockSql.mockResolvedValueOnce([maturedCD]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: false },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("CD_MATURED");
    });
  });

  describe("Penalty Calculations", () => {
    it("should calculate correct penalty preview for CD", async () => {
      // CD with $10,000 principal at 6% APY, earned $200 interest
      const cdAccount = mockAccountFactory({
        id: cdAccountId,
        type: "cd",
        agent_id: mockAgent.id,
        balance: "10200.00",
        cd_principal: "10000.00",
        interest_rate: "0.06",
        cd_maturity_date: new Date(Date.now() + 180 * 86400000), // 180 days from now
      });
      mockSql.mockResolvedValueOnce([cdAccount]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: false },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.preview).toBe(true);
      expect(body.principal).toBe(10000);
      expect(body.earned_interest).toBe(200);
      // 3 months interest = 10000 * (0.06 / 12) * 3 = $150
      expect(body.penalty).toBe(150);
      // Amount after penalty = 10200 - 150 = 10050
      expect(body.amount_after_penalty).toBe(10050);
    });

    it("should cap penalty at earned interest when less than 3 months of interest", async () => {
      // CD with $10,000 principal, only $50 earned (new CD)
      const cdAccount = mockAccountFactory({
        id: cdAccountId,
        type: "cd",
        agent_id: mockAgent.id,
        balance: "10050.00",
        cd_principal: "10000.00",
        interest_rate: "0.06",
        cd_maturity_date: new Date(Date.now() + 330 * 86400000), // Almost a year from now
      });
      mockSql.mockResolvedValueOnce([cdAccount]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: false },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      // Three months penalty would be $150, but only $50 earned
      // So penalty is capped at $50 (earned interest)
      expect(body.penalty).toBe(50);
      // Amount after penalty = 10050 - 50 = 10000 (just the principal)
      expect(body.amount_after_penalty).toBe(10000);
    });

    it("should return penalty of 0 when no interest earned", async () => {
      // Brand new CD with no interest yet
      const cdAccount = mockAccountFactory({
        id: cdAccountId,
        type: "cd",
        agent_id: mockAgent.id,
        balance: "10000.00",
        cd_principal: "10000.00",
        interest_rate: "0.06",
        cd_maturity_date: new Date(Date.now() + 365 * 86400000),
      });
      mockSql.mockResolvedValueOnce([cdAccount]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: false },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(body.earned_interest).toBe(0);
      expect(body.penalty).toBe(0);
      expect(body.amount_after_penalty).toBe(10000);
    });
  });

  describe("Confirmation (Actual Withdrawal)", () => {
    it("should execute withdrawal when confirm is true", async () => {
      const cdAccount = mockAccountFactory({
        id: cdAccountId,
        type: "cd",
        agent_id: mockAgent.id,
        balance: "10150.00",
        cd_principal: "10000.00",
        interest_rate: "0.06",
        cd_maturity_date: new Date(Date.now() + 180 * 86400000),
      });
      const checkingAccount = mockAccountFactory({
        id: "checking-123",
        type: "checking",
        agent_id: mockAgent.id,
        balance: "5000.00",
      });

      // Get CD account
      mockSql.mockResolvedValueOnce([cdAccount]);
      // Get checking account
      mockSql.mockResolvedValueOnce([checkingAccount]);
      // Close CD account
      mockSql.mockResolvedValueOnce([]);
      // Update checking balance
      mockSql.mockResolvedValueOnce([]);
      // Create CD transaction
      mockSql.mockResolvedValueOnce([]);
      // Create checking transaction
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: true },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toBeDefined();
    });

    it("should fail if no checking account exists", async () => {
      const cdAccount = mockAccountFactory({
        id: cdAccountId,
        type: "cd",
        agent_id: mockAgent.id,
        balance: "10150.00",
        cd_principal: "10000.00",
        interest_rate: "0.06",
        cd_maturity_date: new Date(Date.now() + 180 * 86400000),
      });

      // Get CD account
      mockSql.mockResolvedValueOnce([cdAccount]);
      // No checking account found
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        `http://localhost:3000/api/v1/accounts/${cdAccountId}/early-withdraw`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
          body: { confirm: true },
        },
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: cdAccountId }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("NO_CHECKING");
    });
  });
});
