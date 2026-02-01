import { NextRequest } from 'next/server';

interface MockRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  searchParams?: Record<string, string>;
}

/**
 * Creates a mock NextRequest for testing API routes
 */
export function createMockRequest(
  url: string = 'http://localhost:3000/api/test',
  options: MockRequestOptions = {}
): NextRequest {
  const { method = 'GET', headers = {}, body, searchParams = {} } = options;

  const urlObj = new URL(url);
  Object.entries(searchParams).forEach(([key, value]) => {
    urlObj.searchParams.set(key, value);
  });

  const requestInit: RequestInit = {
    method,
    headers: new Headers(headers),
  };

  if (body && method !== 'GET') {
    requestInit.body = JSON.stringify(body);
  }

  return new NextRequest(urlObj.toString(), requestInit);
}

/**
 * Creates a mock NextRequest with Bearer token authentication
 */
export function createAuthenticatedRequest(
  url: string,
  apiKey: string = 'agentbank_testkey12345678901234567890ab',
  options: MockRequestOptions = {}
): NextRequest {
  return createMockRequest(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

/**
 * Creates a mock NextRequest for cron endpoints with cron secret
 */
export function createCronRequest(
  url: string,
  cronSecret: string = 'test-cron-secret',
  options: MockRequestOptions = {}
): NextRequest {
  return createMockRequest(url, {
    method: 'POST',
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${cronSecret}`,
    },
  });
}

/**
 * Helper to extract JSON body from a Response
 */
export async function getResponseBody<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Standard API response types
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
