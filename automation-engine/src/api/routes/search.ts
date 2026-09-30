import { Router, Request, Response } from 'express';
import { requireUserId, AuthenticatedRequest } from '../middleware/auth.js';
import { SearchProfileRepository } from '../../repositories/searchProfileRepository.js';
import { ResumeRepository } from '../../repositories/resumeRepository.js';
import { ApplicationRepository } from '../../repositories/applicationRepository.js';
import { scrapeQueue } from '../../queue/jobQueues.js';
import { UsageLimiter, DailyLimitExceededError } from '../../domain/UsageLimiter.js';
import { PLAN_LIMITS, PlanName, isValidPlan } from '../../config/plans.js';

const router = Router();
const searchProfileRepo = new SearchProfileRepository();
const resumeRepo = new ResumeRepository();
const applicationRepo = new ApplicationRepository();
const usageLimiter = new UsageLimiter();

const DEFAULT_BOARDS = ['greenhouse', 'lever', 'remoteok', 'indeed'];
const DEFAULT_LOCATIONS = ['Remote'];

/**
 * POST /api/me/search/start
 *
 * The "missing button": onboarding only stores a resume and a search profile,
 * nothing ever puts a job on the scrape queue. This route reads the
 * authenticated user's saved resume + search profile and enqueues a
 * user-scoped scrape job so the existing ScrapeWorker -> AIWorker -> ResumeWorker
 * -> ApplyWorker pipeline actually starts moving.
 *
 * USAGE MODEL: one token is consumed per search START, regardless of how many
 * (if any) results get applied to. Applying is unlimited/free. Search itself
 * scrapes broadly per board under the hood, but only the top N results per
 * board (per the user's plan) are persisted/shown — see PLAN_LIMITS.maxResultsPerBoard.
 *
 * Starting a new search REPLACES the user's previous results — their prior
 * Application rows are cleared so the dashboard reflects only this run.
 */
router.post('/start', requireUserId, async (req: Request, res: Response) => {
  const { userId, userPlan } = req as AuthenticatedRequest;

  try {
    const activeResume = await resumeRepo.findActiveByUser(userId);
    if (!activeResume) {
      res.status(400).json({
        error: 'No resume on file. Upload a resume before starting a job search.',
      });
      return;
    }

    const profile = await searchProfileRepo.findByUser(userId);
    if (!profile || !profile.titles || profile.titles.length === 0) {
      res.status(400).json({
        error: 'No search profile set. Add at least one job title in Settings before starting a job search.',
      });
      return;
    }

    //    previous search for this user is still in flight.
    const [waiting, active, delayed] = await Promise.all([
      scrapeQueue.getJobs(['waiting']),
      scrapeQueue.getJobs(['active']),
      scrapeQueue.getJobs(['delayed']),
    ]);
    const alreadyQueued = [...waiting, ...active, ...delayed].some(
      (j) => j.data?.userId === userId
    );
    if (alreadyQueued) {
      res.status(409).json({
        error: 'A job search is already running for your account. Sit tight — new matches will appear on the dashboard shortly.',
      });
      return;
    }

    try {
      await usageLimiter.check(userId, userPlan);
    } catch (err) {
      if (err instanceof DailyLimitExceededError) {
        res.status(429).json({ error: err.message });
        return;
      }
      throw err;
    }

    // ['linkedin', 'greenhouse', 'lever']. LinkedIn scraping stays opt-in only
    // (see README ToS note) but is honored here if the user explicitly chose it.
    const boards = profile.boards && profile.boards.length > 0 ? profile.boards : DEFAULT_BOARDS;
    const locations = profile.locations && profile.locations.length > 0 ? profile.locations : DEFAULT_LOCATIONS;

    const plan: PlanName = isValidPlan(userPlan) ? userPlan : 'FREE';
    const maxResultsPerBoard = PLAN_LIMITS[plan].maxResultsPerBoard;

    // 5. A new search REPLACES old results — clear this user's previously
    //    tracked applications before enqueueing the new run.
    const cleared = await applicationRepo.deleteAllForUser(userId);
    if (cleared > 0) {
      console.log(`🧹 [SearchRoute] Cleared ${cleared} previous result(s) for user ${userId} before starting a new search.`);
    }

    // 6. Consume the quota token now that we're committed to running this search.
    await usageLimiter.record(userId, boards, profile.titles);

    const job = await scrapeQueue.add(`user-triggered-scrape-${userId}`, {
      boards,
      searchQueries: profile.titles,
      locations,
      limit: maxResultsPerBoard,
      userId,
    });

    console.log(
      `🚀 [SearchRoute] User ${userId} started a job search. Boards: ${boards.join(', ')} | ` +
      `Titles: ${profile.titles.join(', ')} | Locations: ${locations.join(', ')} | ` +
      `Max results/board: ${maxResultsPerBoard} | BullMQ Job ID: ${job.id}`
    );

    res.status(202).json({
      success: true,
      queued: true,
      message: 'Job search started. New matches will appear on your dashboard as they\'re found.',
      boards,
      titles: profile.titles,
      locations,
      maxResultsPerBoard,
    });
  } catch (err: any) {
    console.error('[SearchRoute] Failed to start search:', err);
    res.status(500).json({ error: err.message || 'Failed to start job search.' });
  }
});

export default router;