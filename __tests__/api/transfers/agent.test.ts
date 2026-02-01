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
import { POST } from "@/app/api/v1/transfer/agent/route";

describe("POST /api/v1/transfer/agent", () => {
  const mockSender = mockAgentFactory({
    id: "sender-123",
    name: "SenderAgent",
  });
  const mockRecipient = mockAgentFactory({
    id: "recipient-456",
    name: "RecipientAgent",
  });

  beforeEach(() => {
    mockSql.mockReset();
    mockAuthenticateAgent.mockReset();
    mockAuthenticateAgent.mockResolvedValue({
      success: true,
      agent: mockSender,
    });
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mockAuthenticateAgent.mockResolvedValueOnce({
        success: false,
        error: "Unauthorized",
      });

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          body: { to_agent: "RecipientAgent", amount: 100 },
        },
      );
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe("Validation", () => {
    it("should reject transfer without recipient", async () => {
      // When to_agent is undefined, the SQL query will fail to find a recipient
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { amount: 100 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("AGENT_NOT_FOUND");
    });

    it("should reject transfer without amount", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "RecipientAgent" },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("INVALID_AMOUNT");
    });

    it("should reject negative amount", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "RecipientAgent", amount: -100 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("INVALID_AMOUNT");
    });

    it("should reject zero amount", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "RecipientAgent", amount: 0 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("INVALID_AMOUNT");
    });

    it("should reject transfer over $10,000 limit", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "RecipientAgent", amount: 10001 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("AMOUNT_TOO_LARGE");
    });

    it("should accept transfer of exactly $10,000", async () => {
      // Recipient lookup
      mockSql.mockResolvedValueOnce([mockRecipient]);
      // Sender's checking account
      mockSql.mockResolvedValueOnce([
        mockAccountFactory({
          agent_id: mockSender.id,
          balance: "15000.00",
        }),
      ]);
      // Recipient's checking account
      mockSql.mockResolvedValueOnce([
        mockAccountFactory({
          id: "recipient-checking",
          agent_id: mockRecipient.id,
        }),
      ]);
      // Update sender balance
      mockSql.mockResolvedValueOnce([]);
      // Update recipient balance
      mockSql.mockResolvedValueOnce([]);
      // Create sender transaction
      mockSql.mockResolvedValueOnce([]);
      // Create recipient transaction
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "RecipientAgent", amount: 10000 },
        },
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Recipient Validation", () => {
    it("should reject transfer to non-existent agent", async () => {
      // Recipient not found
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "NonExistentAgent", amount: 100 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("AGENT_NOT_FOUND");
    });

    it("should reject self-transfer", async () => {
      // Recipient is the same as sender
      mockSql.mockResolvedValueOnce([mockSender]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "SenderAgent", amount: 100 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("SELF_TRANSFER");
    });

    it("should reject transfer to inactive agent", async () => {
      const inactiveRecipient = mockAgentFactory({
        id: "inactive-123",
        name: "InactiveAgent",
        is_active: false,
      });
      mockSql.mockResolvedValueOnce([inactiveRecipient]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "InactiveAgent", amount: 100 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("AGENT_INACTIVE");
    });
  });

  describe("Insufficient Funds", () => {
    it("should reject when sender has insufficient funds", async () => {
      // Recipient found
      mockSql.mockResolvedValueOnce([mockRecipient]);
      // Sender's checking account with low balance
      mockSql.mockResolvedValueOnce([
        mockAccountFactory({
          agent_id: mockSender.id,
          balance: "50.00",
        }),
      ]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: { to_agent: "RecipientAgent", amount: 100 },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("INSUFFICIENT_FUNDS");
    });
  });

  describe("Successful Transfer", () => {
    it("should complete transfer with memo", async () => {
      // Recipient lookup
      mockSql.mockResolvedValueOnce([mockRecipient]);
      // Sender's checking account
      mockSql.mockResolvedValueOnce([
        mockAccountFactory({
          agent_id: mockSender.id,
          balance: "5000.00",
        }),
      ]);
      // Recipient's checking account
      mockSql.mockResolvedValueOnce([
        mockAccountFactory({
          id: "recipient-checking",
          agent_id: mockRecipient.id,
        }),
      ]);
      // Update sender balance
      mockSql.mockResolvedValueOnce([]);
      // Update recipient balance
      mockSql.mockResolvedValueOnce([]);
      // Create sender transaction
      mockSql.mockResolvedValueOnce([]);
      // Create recipient transaction
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/transfer/agent",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${mockSender.api_key}` },
          body: {
            to_agent: "RecipientAgent",
            amount: 100,
            memo: "Thanks for the help!",
          },
        },
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.transfer).toBeDefined();
      expect(body.transfer.amount).toBe(100);
      expect(body.transfer.to_agent).toBe("RecipientAgent");
    });
  });
});
