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
import { GET, POST } from "@/app/api/v1/accounts/route";

describe("/api/v1/accounts", () => {
  const mockAgent = mockAgentFactory();

  beforeEach(() => {
    mockSql.mockReset();
    mockAuthenticateAgent.mockReset();
    mockAuthenticateAgent.mockResolvedValue({
      success: true,
      agent: mockAgent,
    });
  });

  describe("GET /api/v1/accounts", () => {
    it("should return 401 when not authenticated", async () => {
      mockAuthenticateAgent.mockResolvedValueOnce({
        success: false,
        error: "Unauthorized",
      });

      const request = createMockRequest(
        "http://localhost:3000/api/v1/accounts",
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
    });

    it("should return all accounts for authenticated agent", async () => {
      const checkingAccount = mockAccountFactory({ type: "checking" });
      const savingsAccount = mockAccountFactory({
        id: "account-456",
        type: "savings",
        balance: "5000.00",
        interest_rate: "0.035",
      });

      mockSql.mockResolvedValueOnce([checkingAccount, savingsAccount]);
      mockSql.mockResolvedValueOnce([
        { total_balance: "15000.00", total_interest: "50.00" },
      ]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/accounts",
        {
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
        },
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.accounts).toHaveLength(2);
    });

    it("should include account totals in response", async () => {
      const account = mockAccountFactory();
      mockSql.mockResolvedValueOnce([account]);
      mockSql.mockResolvedValueOnce([
        { total_balance: "10000.00", total_interest: "25.50" },
      ]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/accounts",
        {
          headers: { Authorization: `Bearer ${mockAgent.api_key}` },
        },
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.total_balance).toBeDefined();
      expect(body.total_balance).toBe(10000);
      expect(body.total_interest_earned).toBe(25.5);
    });
  });

  describe("POST /api/v1/accounts", () => {
    it("should return 401 when not authenticated", async () => {
      mockAuthenticateAgent.mockResolvedValueOnce({
        success: false,
        error: "Unauthorized",
      });

      const request = createMockRequest(
        "http://localhost:3000/api/v1/accounts",
        {
          method: "POST",
          body: { type: "savings" },
        },
      );
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    describe("Account Type Validation", () => {
      it("should reject invalid account type", async () => {
        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "invalid_type" },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("INVALID_TYPE");
      });

      it("should accept valid account types", async () => {
        const validTypes = ["savings", "money_market"];

        for (const type of validTypes) {
          mockSql.mockReset();
          mockAuthenticateAgent.mockResolvedValue({
            success: true,
            agent: mockAgent,
          });

          const depositAmount = type === "money_market" ? 2500 : 1000;

          // 1. Get checking account for initial deposit
          mockSql.mockResolvedValueOnce([
            {
              id: "checking-123",
              balance: "10000.00",
            },
          ]);
          // 2. Update checking balance (deduct)
          mockSql.mockResolvedValueOnce([]);
          // 3. Record withdrawal transaction from checking
          mockSql.mockResolvedValueOnce([]);
          // 4. Create new account (INSERT ... RETURNING)
          mockSql.mockResolvedValueOnce([
            {
              id: "new-account-123",
              type: type,
              nickname: null,
              balance: String(depositAmount) + ".00",
              interest_rate: "0.035",
              cd_term_months: null,
              cd_maturity_date: null,
              created_at: new Date().toISOString(),
            },
          ]);
          // 5. Record deposit transaction to new account
          mockSql.mockResolvedValueOnce([]);

          const request = createMockRequest(
            "http://localhost:3000/api/v1/accounts",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${mockAgent.api_key}` },
              body: {
                type,
                initial_deposit: depositAmount,
              },
            },
          );
          const response = await POST(request);

          expect(response.status).toBe(201);
        }
      });
    });

    describe("Minimum Balance Requirements", () => {
      it("should reject savings account with less than $100", async () => {
        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "savings", initial_deposit: 50 },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("MIN_BALANCE_REQUIRED");
      });

      it("should reject money market with less than $2500", async () => {
        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "money_market", initial_deposit: 2000 },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("MIN_BALANCE_REQUIRED");
      });

      it("should reject CD with less than $500", async () => {
        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "cd", initial_deposit: 400, term_months: 3 },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("MIN_BALANCE_REQUIRED");
      });
    });

    describe("CD Creation", () => {
      it("should require term_months for CD accounts", async () => {
        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "cd", initial_deposit: 1000 },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("INVALID_CD_TERM");
      });

      it("should only accept valid CD terms (3, 6, 12)", async () => {
        const invalidTerms = [1, 2, 5, 9, 24];

        for (const term of invalidTerms) {
          const request = createMockRequest(
            "http://localhost:3000/api/v1/accounts",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${mockAgent.api_key}` },
              body: { type: "cd", initial_deposit: 1000, term_months: term },
            },
          );
          const response = await POST(request);
          const body = await response.json();

          expect(response.status).toBe(400);
          expect(body.code).toBe("INVALID_CD_TERM");
        }
      });

      it("should create CD with valid term", async () => {
        // 1. Get checking account
        mockSql.mockResolvedValueOnce([
          {
            id: "checking-123",
            balance: "10000.00",
          },
        ]);
        // 2. Update checking balance (deduct)
        mockSql.mockResolvedValueOnce([]);
        // 3. Record withdrawal transaction from checking
        mockSql.mockResolvedValueOnce([]);
        // 4. Create CD account (INSERT ... RETURNING)
        const maturityDate = new Date();
        maturityDate.setMonth(maturityDate.getMonth() + 6);
        mockSql.mockResolvedValueOnce([
          {
            id: "cd-account-123",
            type: "cd",
            nickname: null,
            balance: "1000.00",
            interest_rate: "0.042",
            cd_term_months: 6,
            cd_maturity_date: maturityDate.toISOString(),
            created_at: new Date().toISOString(),
          },
        ]);
        // 5. Record deposit transaction to new account
        mockSql.mockResolvedValueOnce([]);

        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "cd", initial_deposit: 1000, term_months: 6 },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.success).toBe(true);
      });
    });

    describe("Insufficient Funds", () => {
      it("should reject when checking balance is insufficient", async () => {
        // Return checking account with low balance
        mockSql.mockResolvedValueOnce([
          mockAccountFactory({ balance: "100.00" }),
        ]);

        const request = createMockRequest(
          "http://localhost:3000/api/v1/accounts",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${mockAgent.api_key}` },
            body: { type: "savings", initial_deposit: 500 },
          },
        );
        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.code).toBe("INSUFFICIENT_FUNDS");
      });
    });
  });
});
