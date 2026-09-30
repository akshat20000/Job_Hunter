import express from 'express';
import cors from "cors";
import usageRouter from './routes/usage.js';
import resumesRouter from './routes/resumes.js';
import applicationsRouter from './routes/applications.js';
import searchProfileRouter from './routes/searchProfile.js';
import searchRouter from './routes/search.js';
import authRouter from './routes/auth.js';
import onboardingRouter from './routes/onboarding.js';

export function createApiApp() {
  const app = express();

   app.use(
        cors({
            origin: "http://localhost:3002",
            credentials: true,
        })
    );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Public auth routes (no userId middleware — they handle auth themselves)
  app.use('/api/auth', authRouter);

  // Protected user-scoped routes
  app.use('/api/me/usage', usageRouter);
  app.use('/api/me/resumes', resumesRouter);
  app.use('/api/me/applications', applicationsRouter);
  app.use('/api/me/search-profile', searchProfileRouter);
  app.use('/api/me/search', searchRouter);
  app.use('/api/me/onboarding', onboardingRouter);

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}