import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCronRequest,
  createMockRequest,
} from "../../setup/mocks/request.mock";

// Mock the modules - vi.hoisted ensures mocks are available when vi.mock runs
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
import { POST, GET } from "@/app/api/cron/daily-interest/route";

describe("/api/cron/daily-interest", () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  describe("Authentication", () => {
    it("should return 401 without authorization", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/cron/daily-interest",
        {
          method: "POST",
        },
      );
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("should return 401 with wrong secret", async () => {
      const request = createMockRequest(
        "http://localhost:3000/api/cron/daily-interest",
        {
          method: "POST",
          headers: { Authorization: "Bearer wrong-secret" },
        },
      );
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("should accept valid cron secret", async () => {
      // Call stored procedure
      mockSql.mockResolvedValueOnce([]);
      // Get stats
      mockSql.mockResolvedValueOnce([
        { accounts_processed: "10", accounts_credited: "5" },
      ]);
      // Get total interest today
      mockSql.mockResolvedValueOnce([{ total: "25.50" }]);

      const request = createCronRequest(
        "http://localhost:3000/api/cron/daily-interest",
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Interest Crediting", () => {
    it("should call credit_daily_interest stored procedure", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        { accounts_processed: "10", accounts_credited: "5" },
      ]);
      mockSql.mockResolvedValueOnce([{ total: "25.50" }]);

      const request = createCronRequest(
        "http://localhost:3000/api/cron/daily-interest",
      );
      await POST(request);

      // First call should be the stored procedure
      expect(mockSql).toHaveBeenCalled();
    });

    it("should return processing statistics", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        { accounts_processed: "50", accounts_credited: "30" },
      ]);
      mockSql.mockResolvedValueOnce([{ total: "125.75" }]);

      const request = createCronRequest(
        "http://localhost:3000/api/cron/daily-interest",
      );
      const response = await POST(request);
      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.accounts_processed).toBe(50);
      expect(body.accounts_credited).toBe(30);
      expect(body.total_interest_today).toBe(125.75);
    });

    it("should include execution timestamp", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        { accounts_processed: "0", accounts_credited: "0" },
      ]);
      mockSql.mockResolvedValueOnce([{ total: "0" }]);

      const request = createCronRequest(
        "http://localhost:3000/api/cron/daily-interest",
      );
      const response = await POST(request);
      const body = await response.json();

      expect(body.executed_at).toBeDefined();
      expect(new Date(body.executed_at)).toBeInstanceOf(Date);
    });

    it("should handle zero accounts gracefully", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        { accounts_processed: "0", accounts_credited: "0" },
      ]);
      mockSql.mockResolvedValueOnce([{ total: "0" }]);

      const request = createCronRequest(
        "http://localhost:3000/api/cron/daily-interest",
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.accounts_processed).toBe(0);
      expect(body.total_interest_today).toBe(0);
    });
  });

  describe("GET endpoint", () => {
    it("should also work with GET requests", async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([
        { accounts_processed: "5", accounts_credited: "3" },
      ]);
      mockSql.mockResolvedValueOnce([{ total: "10.00" }]);

      const request = createMockRequest(
        "http://localhost:3000/api/cron/daily-interest",
        {
          method: "GET",
          headers: { Authorization: "Bearer test-cron-secret" },
        },
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors", async () => {
      mockSql.mockRejectedValueOnce(new Error("Database connection failed"));

      const request = createCronRequest(
        "http://localhost:3000/api/cron/daily-interest",
      );
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.code).toBe("CRON_FAILED");
    });
  });
});
