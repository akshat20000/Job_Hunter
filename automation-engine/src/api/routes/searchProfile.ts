import { Router, Request, Response } from 'express';
import { requireUserId, AuthenticatedRequest } from '../middleware/auth.js';
import { SearchProfileRepository } from '../../repositories/searchProfileRepository.js';
import { UserRepository } from '../../repositories/userRepository.js';

const router = Router();
const searchProfileRepo = new SearchProfileRepository();
const userRepo = new UserRepository();

/**
 * GET /api/me/search-profile
 * Returns the authenticated user's search preferences.
 */
router.get('/', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  try {
    const profile = await searchProfileRepo.findByUser(userId);
    if (!profile) {
      // Return empty defaults if no profile set yet
      res.json({
        titles: [],
        locations: [],
        boards: [],
        remoteOnly: false,
        minSalary: null,
        experienceLevel: null,
      });
      return;
    }
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/me/search-profile
 * Create or update the authenticated user's search preferences.
 *
 * Body: { titles?, locations?, boards?, remoteOnly?, minSalary?, experienceLevel? }
 */
router.put('/', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;

  const { titles, locations, boards, remoteOnly, minSalary, experienceLevel } = req.body as {
    titles?: string[];
    locations?: string[];
    boards?: string[];
    remoteOnly?: boolean;
    minSalary?: number | null;
    experienceLevel?: string | null;
  };

  const allowedBoards = [
    'linkedin',
    'greenhouse',
    'lever',
    'remoteok',
    'indeed',
    'glassdoor',
    'usajobs',
    'adzuna',
  ];
  if (boards && boards.some((b) => !allowedBoards.includes(b))) {
    res.status(400).json({
      error: `Invalid board(s). Allowed values: ${allowedBoards.join(', ')}`,
    });
    return;
  }

  try {
    const profile = await searchProfileRepo.upsertByUser(userId, {
      titles,
      locations,
      boards,
      remoteOnly,
      minSalary,
      experienceLevel,
    });
    // Mark user onboarding completed whenever profile preferences are saved
    await userRepo.setOnboardingCompleted(userId, true).catch((e) => {
      console.warn('[SearchProfile] Failed to set onboardingCompleted:', e.message);
    });
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
