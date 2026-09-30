import { Router, Request, Response } from 'express';
import { UserRepository } from '../../repositories/userRepository.js';
import bcrypt from 'bcryptjs';

const router = Router();
const userRepo = new UserRepository();

/**
 * POST /api/auth/signup
 * Create a new user with hashed password. Returns the created user (no password hash).
 *
 * This endpoint is used by the Next.js onboarding flow before NextAuth session is created.
 * NextAuth's CredentialsProvider calls /api/auth/login to verify credentials.
 */
router.post('/signup', async (req: Request, res: Response) => {
  const { email, name, password } = req.body as {
    email?: string;
    name?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  try {
    const existing = await userRepo.findByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepo.create({ email, name, passwordHash, plan: 'FREE' });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      onboardingCompleted: false,
      createdAt: user.createdAt,
    });
  } catch (err: any) {
    console.error('[AuthRoute] Signup failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Verify credentials and return user info (used by NextAuth CredentialsProvider).
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required.' });
    return;
  }

  try {
    const user = await userRepo.findByEmail(email);
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const isOnboarded = Boolean(
      user.onboardingCompleted || (user.searchProfile && user.searchProfile.titles.length > 0)
    );

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      onboardingCompleted: isOnboarded,
    });
  } catch (err: any) {
    console.error('[AuthRoute] Login failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
