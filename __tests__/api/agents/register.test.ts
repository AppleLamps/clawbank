import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "../../setup/mocks/request.mock";

// Mock the db module - vi.hoisted ensures mockSql is available when vi.mock runs
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual("@/lib/db");
  return {
    ...actual,
    sql: mockSql,
  };
});

// Import after mocking
import { POST } from "@/app/api/v1/agents/register/route";

describe("POST /api/v1/agents/register", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  describe("Validation", () => {
    it("should reject request without name", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { description: "Test description" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("MISSING_NAME");
    });

    it("should reject name shorter than 3 characters", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "ab" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_NAME");
    });

    it("should reject name with invalid characters", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "test agent!" }, // spaces and special chars not allowed
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_NAME");
    });

    it("should reject duplicate agent name", async () => {
      // First query returns existing agent
      mockSql.mockResolvedValueOnce([{ id: "existing-agent" }]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "ExistingAgent" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("NAME_TAKEN");
    });
  });

  describe("Successful Registration", () => {
    it("should create agent with valid name", async () => {
      // Check for existing agent - none found
      mockSql.mockResolvedValueOnce([]);
      // Create agent
      mockSql.mockResolvedValueOnce([
        {
          id: "new-agent-123",
          name: "ValidAgent",
          created_at: new Date(),
        },
      ]);
      // Create checking account
      mockSql.mockResolvedValueOnce([{ id: "account-123" }]);
      // Create welcome bonus transaction
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "ValidAgent", description: "A test agent" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.agent).toBeDefined();
      expect(body.agent.name).toBe("ValidAgent");
      expect(body.agent.api_key).toMatch(/^agentbank_/);
      expect(body.welcome_bonus).toBe(10000);
    });

    it("should generate unique API key with correct format", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        {
          id: "new-agent-123",
          name: "TestAgent",
          created_at: new Date(),
        },
      ]);
      mockSql.mockResolvedValueOnce([{ id: "account-123" }]);
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "TestAgent" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(body.agent.api_key).toMatch(/^agentbank_[A-Za-z0-9]{32}$/);
    });

    it("should include claim URL in response", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        {
          id: "new-agent-123",
          name: "ClaimAgent",
          created_at: new Date(),
        },
      ]);
      mockSql.mockResolvedValueOnce([{ id: "account-123" }]);
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "ClaimAgent" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(body.agent.claim_url).toBeDefined();
      expect(body.agent.claim_url).toContain("/claim/");
    });

    it("should include verification code in response", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        {
          id: "new-agent-123",
          name: "VerifyAgent",
          created_at: new Date(),
        },
      ]);
      mockSql.mockResolvedValueOnce([{ id: "account-123" }]);
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "VerifyAgent" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(body.agent.verification_code).toBeDefined();
      expect(body.agent.verification_code).toMatch(/^[A-Z]{4}-[A-Z0-9]{4}$/);
    });

    it("should accept names with underscores and hyphens", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        {
          id: "new-agent-123",
          name: "Valid_Agent-Name",
          created_at: new Date(),
        },
      ]);
      mockSql.mockResolvedValueOnce([{ id: "account-123" }]);
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "Valid_Agent-Name" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
    });
  });

  describe("Welcome Bonus", () => {
    it("should credit $10,000 welcome bonus", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        {
          id: "new-agent-123",
          name: "BonusAgent",
          created_at: new Date(),
        },
      ]);
      mockSql.mockResolvedValueOnce([{ id: "account-123" }]);
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest(
        "http://localhost:3000/api/v1/agents/register",
        {
          method: "POST",
          body: { name: "BonusAgent" },
        },
      );

      const response = await POST(request);
      const body = await response.json();

      expect(body.welcome_bonus).toBe(10000);
      expect(body.message).toContain("$10,000");
    });
  });
});
