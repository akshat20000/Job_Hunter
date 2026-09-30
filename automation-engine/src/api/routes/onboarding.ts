import { Router, Request, Response } from 'express';
import { requireUserId, AuthenticatedRequest } from '../middleware/auth.js';
import { UserRepository } from '../../repositories/userRepository.js';
import { SearchProfileRepository } from '../../repositories/searchProfileRepository.js';
import { ResumeRepository } from '../../repositories/resumeRepository.js';

const router = Router();
const userRepo = new UserRepository();
const searchProfileRepo = new SearchProfileRepository();
const resumeRepo = new ResumeRepository();

/**
 * GET /api/me/onboarding/status
 * Returns whether onboarding has been completed for the user,
 * along with status of resume and search profile.
 */
router.get('/status', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  try {
    const [user, profile, resumes] = await Promise.all([
      userRepo.findById(userId),
      searchProfileRepo.findByUser(userId),
      resumeRepo.findByUser(userId),
    ]);

    const hasResume = (resumes || []).some(r => r.isActive);
    const hasSearchProfile = Boolean(profile && profile.titles && profile.titles.length > 0);
    const onboardingCompleted = Boolean(
      user?.onboardingCompleted || (profile !== null && (profile.titles?.length ?? 0) > 0)
    );

    res.json({
      onboardingCompleted,
      hasResume,
      hasSearchProfile,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/me/onboarding/complete
 * Explicitly mark onboarding as complete for the user.
 */
router.post('/complete', requireUserId, async (req: Request, res: Response) => {
  const { userId } = req as AuthenticatedRequest;
  try {
    await userRepo.setOnboardingCompleted(userId, true);
    res.json({ success: true, onboardingCompleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
