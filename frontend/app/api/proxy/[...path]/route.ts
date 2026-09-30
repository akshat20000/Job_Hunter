import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Catch-all API proxy that forwards requests to the automation-engine,
 * injecting the authenticated user's ID from the server-side session.
 *
 * WHY: Previously, the frontend sent `X-User-Id` directly from the browser.
 * Any user could change this header in DevTools to impersonate another user.
 * Now, all client-side API calls go through `/api/proxy/...` and the userId
 * is injected here from the verified NextAuth session — never exposed to
 * the client.
 *
 * ROUTES:
 *   /api/proxy/me/applications  →  automation-engine /api/me/applications
 *   /api/proxy/me/search/start  →  automation-engine /api/me/search/start
 *   etc.
 */

const BACKEND_URL =
  process.env.AUTOMATION_ENGINE_URL || 'http://localhost:3001';

async function proxyRequest(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized: no user ID in session' }, { status: 401 });
  }

  // Extract the downstream path: /api/proxy/me/applications → /api/me/applications
  const url = new URL(req.url);
  const proxyPath = url.pathname.replace(/^\/api\/proxy/, '/api');
  const downstream = `${BACKEND_URL}${proxyPath}${url.search}`;

  // Build headers — forward content-type but inject X-User-Id server-side
  const headers: Record<string, string> = {
    'X-User-Id': userId,
  };

  const contentType = req.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // Forward the request body for non-GET methods
  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // For multipart/form-data (file uploads), forward as-is
    if (contentType?.includes('multipart/form-data')) {
      body = await req.formData();
      // Let fetch compute the Content-Type header with the valid multipart boundary
      delete headers['Content-Type'];
    } else {
      body = await req.text();
    }
  }

  try {
    const res = await fetch(downstream, {
      method: req.method,
      headers,
      body,
    });

    // Stream the response back — check if it's a PDF/binary or JSON
    const resContentType = res.headers.get('content-type') || '';

    if (resContentType.includes('application/pdf') || resContentType.includes('application/octet-stream')) {
      // Binary response — stream it
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: {
          'Content-Type': resContentType,
          'Content-Disposition': res.headers.get('Content-Disposition') || '',
        },
      });
    }

    // JSON/text response
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': resContentType || 'application/json' },
    });
  } catch (err: any) {
    console.error('[API Proxy] Downstream request failed:', err.message);
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) { return proxyRequest(req); }
export async function POST(req: NextRequest) { return proxyRequest(req); }
export async function PUT(req: NextRequest) { return proxyRequest(req); }
export async function PATCH(req: NextRequest) { return proxyRequest(req); }
export async function DELETE(req: NextRequest) { return proxyRequest(req); }
