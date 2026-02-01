import { vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
