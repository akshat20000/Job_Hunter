import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageLimiter, DailyLimitExceededError } from '../../src/domain/UsageLimiter.js';

// Mock the SearchRunRepository to avoid DB connections in unit tests
vi.mock('../../src/repositories/searchRunRepository.js', () => ({
  SearchRunRepository: vi.fn().mockImplementation(() => ({
    countToday: vi.fn(),
  })),
}));

// Mock env/config to avoid validation failures
vi.mock('../../src/config/index.js', () => ({
  env: { DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock' },
  prisma: {},
}));

describe('UsageLimiter', () => {
  let limiter: UsageLimiter;
  let mockCountToday: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    limiter = new UsageLimiter();
    // Access the mocked instance's method
    mockCountToday = (limiter as any).searchRunRepo.countToday;
  });

  describe('FREE plan (limit = 4)', () => {
    it('should allow application when count is below limit', async () => {
      mockCountToday.mockResolvedValue(3);
      await expect(limiter.check('user-1', 'FREE')).resolves.toBeUndefined();
    });

    it('should reject at exactly the limit (4)', async () => {
      mockCountToday.mockResolvedValue(4);
      await expect(limiter.check('user-1', 'FREE')).rejects.toThrow(DailyLimitExceededError);
    });

    it('should reject when over limit', async () => {
      mockCountToday.mockResolvedValue(10);
      await expect(limiter.check('user-1', 'FREE')).rejects.toThrow(
        'Daily search limit reached for FREE plan: 10/4 used today'
      );
    });

    it('DailyLimitExceededError should have correct properties', async () => {
      mockCountToday.mockResolvedValue(4);
      let caught: DailyLimitExceededError | undefined;
      try {
        await limiter.check('user-1', 'FREE');
      } catch (e) {
        caught = e as DailyLimitExceededError;
      }
      expect(caught).toBeDefined();
      expect(caught!.plan).toBe('FREE');
      expect(caught!.used).toBe(4);
      expect(caught!.limit).toBe(4);
      expect(caught!.name).toBe('DailyLimitExceededError');
    });
  });

  describe('getUsage', () => {
    it('should return correct usage stats for FREE plan', async () => {
      mockCountToday.mockResolvedValue(2);
      const usage = await limiter.getUsage('user-1', 'FREE');
      expect(usage.used).toBe(2);
      expect(usage.limit).toBe(4);
      expect(usage.plan).toBe('FREE');
      expect((usage as any).remaining).toBeUndefined(); // getUsage doesn't return remaining — that's the route layer
      expect(usage.resetsAt).toBeInstanceOf(Date);
    });

    it('should default unknown plan to FREE', async () => {
      mockCountToday.mockResolvedValue(1);
      const usage = await limiter.getUsage('user-1', 'UNKNOWN_PLAN');
      expect(usage.plan).toBe('FREE');
      expect(usage.limit).toBe(4);
    });
  });
});
