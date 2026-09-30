import http from 'http';
import { env, prisma } from './config/index.js';
import { redisConnection } from './queue/connection.js';
import { register } from './monitoring/metrics.js';

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Healthcheck and metrics-only HTTP server.
 *
 * SECURITY FIX: All legacy unauthenticated API endpoints (/api/jobs,
 * /api/jobs/:id/approve, /api/jobs/:id/resume, /api/jobs/:id/cover-letter)
 * have been removed. Those operations are now exclusively available through
 * the authenticated multi-tenant API on port 3001.
 *
 * This server exposes only:
 *   - GET /health   — infrastructure health check (DB + Redis)
 *   - GET /metrics  — Prometheus metrics export
 */
export function startHealthCheckServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    // ── Health check ──────────────────────────────────────────────────────
    if (pathname === '/health') {
      let isDbConnected = false;
      let isRedisConnected = false;

      try {
        await prisma.$queryRaw`SELECT 1`;
        isDbConnected = true;
      } catch (dbError) {
        console.error('❌ [Healthcheck] Database check failure:', dbError);
      }

      try {
        await redisConnection.ping();
        isRedisConnected = true;
      } catch (redisError) {
        console.error('❌ [Healthcheck] Redis check failure:', redisError);
      }

      const isHealthy = isDbConnected && isRedisConnected;
      sendJson(res, isHealthy ? 200 : 500, {
        status: isHealthy ? 'healthy' : 'unhealthy',
        database: isDbConnected ? 'connected' : 'disconnected',
        redis: isRedisConnected ? 'connected' : 'disconnected',
      });
      return;
    }

    // ── Prometheus metrics ────────────────────────────────────────────────
    if (pathname === '/metrics') {
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(await register.metrics());
      return;
    }

    // ── Root / Dashboard redirect ─────────────────────────────────────────
    if (pathname === '/' || pathname === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>AI Job Agent — Healthcheck</title>
          <style>
            body { background: #f8fafc; color: #334155; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #fff; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            a { color: #3b82f6; text-decoration: none; font-weight: bold; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>AI Job Agent — Healthcheck Server 🏥</h2>
            <p>This port serves health checks and metrics only.</p>
            <p>Access the dashboard at <a href="http://localhost:3002/">http://localhost:3002</a></p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const port = env.PORT || 3000;
  server.listen(port, () => {
    console.log(`🏥 [Healthcheck] Server successfully booted on port ${port}`);
    console.log(`   GET /health  — infrastructure health check`);
    console.log(`   GET /metrics — Prometheus metrics export`);
  });

  return server;
}

export default startHealthCheckServer;