import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { requireUserId, AuthenticatedRequest } from '../middleware/auth.js';
import { ApplicationRepository } from '../../repositories/applicationRepository.js';
import { applyQueue } from '../../queue/jobQueues.js';
import { prisma, env } from '../../config/index.js';

const router = Router();
const appRepo = new ApplicationRepository();

/**
 * GET /api/me/applications
 * Returns all applications for the authenticated user with job + company details.
 */
router.get('/', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  try {
    const apps = await appRepo.findByUserId(userId);
    res.json(
      apps.map((a) => ({
        id: a.id,
        status: a.status,
        appliedAt: a.appliedAt,
        createdAt: a.createdAt,
        errorDetails: a.errorDetails,
        hasResumeArtifact: Boolean(a.resumePath),
        hasCoverLetterArtifact: Boolean(a.coverLetterPath),
        job: {
          id: a.job.id,
          title: a.job.title,
          url: a.job.url,
          location: a.job.location,
          salary: a.job.salary,
          score: a.job.score,
          fitExplanation: a.job.fitExplanation,
          company: { name: a.job.company.name },
          // Signal to the frontend that this is a LinkedIn job requiring manual submission
          isLinkedIn: a.job.url.toLowerCase().includes('linkedin.com'),
        },
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/me/applications/:id
 * Returns a single application (scoped to authenticated user).
 */
router.get('/:id', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const id = req.params['id'] as string;
  try {
    const app = await appRepo.findById(id);
    if (!app || app.userId !== userId) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    res.json(app);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/me/applications/:jobId/artifacts/:type
 * Streams the generated resume or cover letter PDF for a given application,
 * scoped to the authenticated user. `type` must be "resume" or "cover-letter".
 */
router.get('/:jobId/artifacts/:type', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const jobId = req.params['jobId'] as string;
  const type = req.params['type'] as string;

  if (type !== 'resume' && type !== 'cover-letter') {
    res.status(400).json({ error: 'type must be "resume" or "cover-letter".' });
    return;
  }

  try {
    const app = await appRepo.findByUserAndJobId(userId, jobId);
    if (!app) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    const filePath = type === 'resume' ? app.resumePath : app.coverLetterPath;
    if (!filePath) {
      res.status(404).json({ error: 'This artifact has not been generated yet.' });
      return;
    }

    // Defense in depth: only ever serve files that live under STORAGE_DIR.
    const resolved = path.resolve(filePath);
    const storageRoot = path.resolve(env.STORAGE_DIR);
    if (!resolved.startsWith(storageRoot + path.sep)) {
      res.status(400).json({ error: 'Invalid artifact path.' });
      return;
    }

    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Artifact file is missing on disk.' });
      return;
    }

    const filename = `${type}-${app.job.title.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(resolved).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/me/jobs/:jobId/approve
 * Manually enqueue a READY LinkedIn job for manual apply (human review gate).
 * For LinkedIn jobs this just confirms the user has reviewed — they still submit
 * manually through LinkedIn's own UI.
 */
router.post('/approve/:jobId', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  const jobId = req.params['jobId'] as string;
  try {
    const app = await appRepo.findByUserAndJobId(userId, jobId);
    if (!app) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    if (app.status !== 'READY') {
      res.status(400).json({ error: `Application is in status "${app.status}", not READY.` });
      return;
    }

    // For non-LinkedIn jobs: enqueue to the apply worker
    const isLinkedIn = app.job.url.toLowerCase().includes('linkedin.com');
    if (!isLinkedIn) {
      await applyQueue.add(`apply-submission-${jobId}`, { jobId, userId });
      res.json({ success: true, queued: true, message: 'Enqueued for auto-apply.' });
    } else {
      // LinkedIn: just mark as acknowledged — user submits manually via LinkedIn
      res.json({
        success: true,
        queued: false,
        message: 'LinkedIn job acknowledged. Please submit manually at the job URL.',
        jobUrl: app.job.url,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
