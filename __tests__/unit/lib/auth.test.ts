import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest } from "../../setup/mocks/request.mock";
import { mockAgentFactory } from "../../setup/mocks/db.mock";

// Mock the db module - vi.hoisted ensures mockSql is available when vi.mock runs
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  sql: mockSql,
}));

// Import auth module after mocking
import {
  authenticateAgent,
  authenticateCron,
  jsonError,
  jsonSuccess,
} from "@/lib/auth";

describe("lib/auth.ts", () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  describe("authenticateAgent()", () => {
    it("should fail when Authorization header is missing", async () => {
      const request = createMockRequest("http://localhost:3000/api/test");
      const result = await authenticateAgent(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Missing Authorization header");
    });

    it("should fail when Authorization header format is invalid (no Bearer)", async () => {
      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: { Authorization: "InvalidFormat" },
      });
      const result = await authenticateAgent(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });

    it("should fail when Authorization header has wrong scheme", async () => {
      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: { Authorization: "Basic sometoken" },
      });
      const result = await authenticateAgent(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Authorization header format");
    });

    it("should fail when API key does not start with agentbank_", async () => {
      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: { Authorization: "Bearer invalid_key_format" },
      });
      const result = await authenticateAgent(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid API key format");
    });

    it("should fail when agent is not found in database", async () => {
      mockSql.mockResolvedValueOnce([]); // No agent found

      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: {
          Authorization: "Bearer agentbank_testkey12345678901234567890ab",
        },
      });
      const result = await authenticateAgent(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or inactive API key");
    });

    it("should succeed with valid API key and active agent", async () => {
      const mockAgent = mockAgentFactory();
      mockSql.mockResolvedValueOnce([mockAgent]); // Agent found
      mockSql.mockResolvedValueOnce([]); // Update last_active

      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: { Authorization: `Bearer ${mockAgent.api_key}` },
      });
      const result = await authenticateAgent(request);

      expect(result.success).toBe(true);
      expect(result.agent).toBeDefined();
      expect(result.agent?.name).toBe("TestAgent");
    });

    it("should update last_active timestamp on successful auth", async () => {
      const mockAgent = mockAgentFactory();
      mockSql.mockResolvedValueOnce([mockAgent]);
      mockSql.mockResolvedValueOnce([]);

      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: { Authorization: `Bearer ${mockAgent.api_key}` },
      });
      await authenticateAgent(request);

      // Verify that sql was called twice (once for lookup, once for update)
      expect(mockSql).toHaveBeenCalledTimes(2);
    });

    it("should handle database errors gracefully", async () => {
      mockSql.mockRejectedValueOnce(new Error("Database connection failed"));

      const request = createMockRequest("http://localhost:3000/api/test", {
        headers: {
          Authorization: "Bearer agentbank_testkey12345678901234567890ab",
        },
      });
      const result = await authenticateAgent(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Authentication failed");
    });
  });

  describe("authenticateCron()", () => {
    it("should return false when Authorization header is missing", () => {
      const request = createMockRequest("http://localhost:3000/api/cron/test", {
        method: "POST",
      });
      expect(authenticateCron(request)).toBe(false);
    });

    it("should return false when Authorization format is invalid", () => {
      const request = createMockRequest("http://localhost:3000/api/cron/test", {
        method: "POST",
        headers: { Authorization: "InvalidFormat" },
      });
      expect(authenticateCron(request)).toBe(false);
    });

    it("should return false when secret does not match", () => {
      const request = createMockRequest("http://localhost:3000/api/cron/test", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      });
      expect(authenticateCron(request)).toBe(false);
    });

    it("should return true when secret matches", () => {
      const request = createMockRequest("http://localhost:3000/api/cron/test", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      });
      expect(authenticateCron(request)).toBe(true);
    });

    it("should return false when CRON_SECRET env var is not set", () => {
      vi.stubEnv("CRON_SECRET", "");

      const request = createMockRequest("http://localhost:3000/api/cron/test", {
        method: "POST",
        headers: { Authorization: "Bearer some-secret" },
      });
      expect(authenticateCron(request)).toBe(false);
    });
  });

  describe("jsonError()", () => {
    it("should return proper error response structure", async () => {
      const response = jsonError("Test error message", "TEST_ERROR_CODE", 400);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Test error message");
      expect(body.code).toBe("TEST_ERROR_CODE");
    });

    it("should default to status 400 when not specified", async () => {
      const response = jsonError("Test error", "TEST_CODE");
      expect(response.status).toBe(400);
    });

    it("should allow custom status codes", async () => {
      const response401 = jsonError("Unauthorized", "UNAUTHORIZED", 401);
      const response404 = jsonError("Not found", "NOT_FOUND", 404);
      const response500 = jsonError("Server error", "SERVER_ERROR", 500);

      expect(response401.status).toBe(401);
      expect(response404.status).toBe(404);
      expect(response500.status).toBe(500);
    });
  });

  describe("jsonSuccess()", () => {
    it("should return proper success response structure", async () => {
      const response = jsonSuccess({ data: "test value" });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBe("test value");
    });

    it("should spread data into response", async () => {
      const response = jsonSuccess({
        user: { id: 1, name: "Test" },
        items: [1, 2, 3],
      });
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.user).toEqual({ id: 1, name: "Test" });
      expect(body.items).toEqual([1, 2, 3]);
    });

    it("should default to status 200 when not specified", async () => {
      const response = jsonSuccess({ message: "ok" });
      expect(response.status).toBe(200);
    });

    it("should allow custom status codes", async () => {
      const response201 = jsonSuccess({ created: true }, 201);
      expect(response201.status).toBe(201);
    });
  });
});
