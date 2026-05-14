import { Env } from '../types';
import { fetchAndSaveContent, setDefaultCrawler } from '../lib/crawler';

// Maximum request size limits (in bytes)
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB limit

/**
 * Validate request size to prevent DoS attacks
 * @param request The incoming request
 * @returns Response if size limit exceeded, null if valid
 */
function validateRequestSize(request: Request): Response | null {
  const contentLength = request.headers.get('Content-Length');

  if (contentLength) {
    const size = parseInt(contentLength);
    if (size > MAX_REQUEST_SIZE) {
      return new Response(
        JSON.stringify({
          error: 'Request too large',
          message: `Maximum request size is ${MAX_REQUEST_SIZE / 1024 / 1024}MB`,
        }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': isCorsOriginAllowed(origin)
              ? origin
              : 'null',
          },
        }
      );
    }
  }

  return null;
}

/**
 * Validate CORS origin to prevent unauthorized cross-origin requests
 * @param origin The origin header value
 * @returns Whether the origin is allowed
 */
function isCorsOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  const allowedOrigins = [
    'https://bettergov.ph',
    'https://*.bettergov.ph',
    'http://localhost:3000',
    'http://localhost:8787',
    'http://localhost:5173',
  ];

  // Check exact matches
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check wildcard subdomains
  if (origin.endsWith('.bettergov.ph')) {
    return true;
  }

  return false;
}

/**
 * Handler for HTTP requests to the web crawling endpoint
 * This is a generic interface for crawling web content, currently using Jina.ai
 */
export async function onRequest(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const { request, env } = context;

  // Validate request size first
  const sizeValidation = validateRequestSize(request);
  if (sizeValidation) {
    return sizeValidation;
  }

  // Handle CORS origin validation
  const origin = request.headers.get('Origin');
  const isPreflight = request.method === 'OPTIONS';

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Set appropriate origin based on validation
  if (isCorsOriginAllowed(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  } else if (isPreflight) {
    // For preflight requests without valid origin, allow no origin
    corsHeaders['Access-Control-Allow-Origin'] = 'null';
  }

  // Handle CORS preflight requests
  if (isPreflight) {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': isCorsOriginAllowed(origin)
          ? origin
          : 'null',
      },
    });
  }

  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const forceUpdate = url.searchParams.get('force') === 'true';
    const crawler = url.searchParams.get('crawler'); // 'jina' or 'cfbrowser'

    // Set default crawler if specified
    if (crawler) {
      try {
        setDefaultCrawler(crawler);
      } catch {
        console.warn(`Invalid crawler type: ${crawler}, using default`);
      }
    }

    // Check if URL parameter is provided
    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          error: 'Missing URL parameter',
          usage: 'Add ?url=https://example.com to fetch content',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': isCorsOriginAllowed(origin)
              ? origin
              : 'null',
          },
        }
      );
    }

    // If force update is requested, fetch it
    if (forceUpdate) {
      const result = await fetchAndSaveContent(env, targetUrl, crawler);

      if (!result.success) {
        // Return the response with CORS headers
        return new Response(
          JSON.stringify({
            ...result,
            crawler: crawler || 'default',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': isCorsOriginAllowed(origin)
                ? origin
                : 'null',
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          ...result.data,
          source: 'crawler',
          crawler: crawler || 'default',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': isCorsOriginAllowed(origin)
              ? origin
              : 'null',
          },
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: (error as Error).message,
        status: 'error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': isCorsOriginAllowed(origin)
            ? origin
            : 'null',
        },
      }
    );
  }
}
