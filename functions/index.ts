// Main entry point for Cloudflare Workers
import {
  scheduled as getWeatherScheduled,
  onRequest as weatherRequest,
} from './api/weather';
import {
  scheduled as getForexScheduled,
  onRequest as forexRequest,
} from './api/forex';
import { onRequest as crawlRequest } from './api/crawl';
import { onRequest as weatherKVRequest } from './weather';
import { onRequest as forexKVRequest } from './forex';
import { Env } from './types';

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

// Export the scheduled handlers
export { scheduled as scheduled_getWeather } from './api/weather';
export { scheduled as scheduled_getForex } from './api/forex';

// Handler for HTTP requests
export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Scheduled update');
    await getWeatherScheduled(controller, env, ctx);
    await getForexScheduled(controller, env, ctx);
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Validate request size first
    const sizeValidation = validateRequestSize(request);
    if (sizeValidation) {
      return sizeValidation;
    }

    // Handle CORS headers with origin validation
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

    // Handle OPTIONS requests for CORS
    if (isPreflight) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Route API requests to the appropriate handler
    if (path === '/api/weather') {
      const response = await weatherRequest({ request, env, ctx });
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.keys(corsHeaders).forEach(key => {
        newHeaders.set(key, corsHeaders[key]);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    if (path === '/api/forex') {
      const response = await forexRequest({ request, env, ctx });
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.keys(corsHeaders).forEach(key => {
        newHeaders.set(key, corsHeaders[key]);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // Handle the new KV-only endpoints
    if (path === '/weather') {
      const response = await weatherKVRequest({ request, env, ctx });
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.keys(corsHeaders).forEach(key => {
        newHeaders.set(key, corsHeaders[key]);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    if (path === '/forex') {
      const response = await forexKVRequest({ request, env, ctx });
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.keys(corsHeaders).forEach(key => {
        newHeaders.set(key, corsHeaders[key]);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    if (path === '/api/crawl') {
      const response = await crawlRequest({ request, env, ctx });
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.keys(corsHeaders).forEach(key => {
        newHeaders.set(key, corsHeaders[key]);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // Simple API to check if the functions are running
    if (path === '/api/status') {
      return new Response(
        JSON.stringify({
          status: 'online',
          functions: ['weather', 'forex', 'crawl'],
          endpoints: [
            {
              path: '/api/weather',
              description:
                'Get weather data for Philippine cities (fetches from external API)',
              parameters: [
                {
                  name: 'city',
                  required: false,
                  description: 'Specific city to get weather for',
                },
                {
                  name: 'update',
                  required: false,
                  description: 'Set to "true" to force update KV store',
                },
              ],
            },
            {
              path: '/api/forex',
              description:
                'Get currency exchange rates from BSP API (fetches from external API)',
              parameters: [
                {
                  name: 'symbol',
                  required: false,
                  description: 'Filter by currency symbol (e.g., USD)',
                },
                {
                  name: 'update',
                  required: false,
                  description: 'Set to "true" to force update KV store',
                },
              ],
            },
            {
              path: '/weather',
              description:
                'Get weather data from KV store only (no external API calls)',
              parameters: [
                {
                  name: 'city',
                  required: false,
                  description: 'Specific city to get weather for',
                },
              ],
            },
            {
              path: '/forex',
              description:
                'Get forex data from KV store only (no external API calls)',
              parameters: [
                {
                  name: 'symbol',
                  required: false,
                  description: 'Filter by currency symbol (e.g., USD)',
                },
              ],
            },
            {
              path: '/api/crawl',
              description:
                'Get content from a URL using web crawler and store in D1 database',
              parameters: [
                {
                  name: 'url',
                  required: true,
                  description:
                    'URL to fetch content from (must be .gov.ph domain)',
                },
                {
                  name: 'update',
                  required: false,
                  description: 'Set to "true" to force update from crawler',
                },
              ],
            },
          ],
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Return 404 for any other routes
    return new Response(
      JSON.stringify({
        error: 'Not found',
        availableEndpoints: [
          '/api/status',
          '/api/weather',
          '/api/forex',
          '/api/crawl',
          '/weather',
          '/forex',
        ],
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  },
};
