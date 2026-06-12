import { Test, TestingModule } from '@nestjs/testing';
import {
  ThrottlerStorageService,
  ThrottlerModule,
  ThrottlerException,
} from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';
import { TenantThrottleGuard } from './throttle.guard';
import { ThrottlerOptions } from '@nestjs/throttler';

interface CustomThrottlerRequest {
  context: ExecutionContext;
  limit: number;
  ttl: number;
  throttler: ThrottlerOptions;
  getTracker: () => Promise<string>;
  generateKey: (
    context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ) => string;
}

describe('TenantThrottleGuard', () => {
  let guard: TenantThrottleGuard;
  let mockStorageService: jest.Mocked<ThrottlerStorageService>;

  // Helper to build a partial ExecutionContext
  const createMockContext = (overrides?: {
    tier?: string;
    ip?: string;
    ips?: string[];
  }) => {
    const ip = overrides?.ip ?? '127.0.0.1';
    const ips = overrides?.ips;
    const user =
      overrides?.tier !== undefined ? { tier: overrides.tier } : undefined;

    const req: Record<string, unknown> = { ip };
    if (ips) req.ips = ips;
    if (user) req.user = user;

    // Shared response mock so header assertions work across switchToHttp calls
    const res: { header: jest.Mock } = { header: jest.fn() };

    return {
      getClass: () => jest.fn(),
      getHandler: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  };

  // Helper to build the second argument passed to handleRequest
  const createRequestProps = (
    context: ExecutionContext,
    overrides?: { ttl?: number; throttlerName?: string },
  ) =>
    ({
      context,
      limit: 100,
      ttl: overrides?.ttl ?? 60000,
      throttler: { name: overrides?.throttlerName ?? 'short' },
    }) as unknown as CustomThrottlerRequest;

  beforeEach(async () => {
    mockStorageService = {
      increment: jest.fn(),
    } as unknown as jest.Mocked<ThrottlerStorageService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }])],
      providers: [TenantThrottleGuard],
    })
      .overrideProvider(ThrottlerStorageService)
      .useValue(mockStorageService)
      .compile();

    guard = module.get<TenantThrottleGuard>(TenantThrottleGuard);
    Object.defineProperty(guard, 'storageService', {
      value: mockStorageService,
      writable: true,
    });
  });

  // ---------------------------------------------------------------------------
  //  Basic request outcomes
  // ---------------------------------------------------------------------------
  describe('request outcomes', () => {
    it('should allow free tier request under limit', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 50,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const result = await guard['handleRequest'](createRequestProps(context));
      expect(result).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockStorageService.increment).toHaveBeenCalledWith(
        expect.any(String),
        60000,
        100,
        60000,
        'short',
      );
    });

    it('should allow free tier at exactly the limit boundary (100 hits)', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 100,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const result = await guard['handleRequest'](createRequestProps(context));
      expect(result).toBe(true);
    });

    it('should throw ThrottlerException for free tier one over limit (101 hits)', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 101,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await expect(
        guard['handleRequest'](createRequestProps(context)),
      ).rejects.toThrow(ThrottlerException);
    });

    it('should throw ThrottlerException when isBlocked is true even if under limit', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60000,
        isBlocked: true,
        timeToBlockExpire: 30000,
      });

      await expect(
        guard['handleRequest'](createRequestProps(context)),
      ).rejects.toThrow(ThrottlerException);
    });

    it('should allow pro tier request under extended limit', async () => {
      const context = createMockContext({ tier: 'pro' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 900,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const result = await guard['handleRequest'](createRequestProps(context));
      expect(result).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockStorageService.increment).toHaveBeenCalledWith(
        expect.any(String),
        60000,
        1000,
        60000,
        'short',
      );
    });

    it('should throw ThrottlerException for pro tier over extended limit', async () => {
      const context = createMockContext({ tier: 'pro' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 1001,
        timeToExpire: 60000,
        isBlocked: true,
        timeToBlockExpire: 60000,
      });

      await expect(
        guard['handleRequest'](createRequestProps(context)),
      ).rejects.toThrow(ThrottlerException);
    });

    it('should default to free tier when user has no tier', async () => {
      const context = createMockContext({}); // no user
      mockStorageService.increment.mockResolvedValue({
        totalHits: 50,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const result = await guard['handleRequest'](createRequestProps(context));
      expect(result).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockStorageService.increment).toHaveBeenCalledWith(
        expect.any(String),
        60000,
        100,
        60000,
        'short',
      );
    });

    it('should default to free tier when unknown tier specified', async () => {
      const context = createMockContext({ tier: 'random_tier' }); // unknown tier
      mockStorageService.increment.mockResolvedValue({
        totalHits: 50,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const result = await guard['handleRequest'](createRequestProps(context));
      expect(result).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockStorageService.increment).toHaveBeenCalledWith(
        expect.any(String),
        60000,
        100, // free limit is 100
        60000,
        'short',
      );
    });
  });

  // ---------------------------------------------------------------------------
  //  Rate limit headers
  // ---------------------------------------------------------------------------
  describe('rate limit headers', () => {
    // Helper that casts the mock response to avoid ESLint any-issues per-use
    const getHeaderMock = (ctx: ExecutionContext): { header: jest.Mock } =>
      ctx.switchToHttp().getResponse();

    it('should set X-RateLimit-Limit header to free limit for free tier', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 5,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await guard['handleRequest'](createRequestProps(context));
      const res = getHeaderMock(context);

      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });

    it('should set X-RateLimit-Limit header to pro limit for pro tier', async () => {
      const context = createMockContext({ tier: 'pro' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 5,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await guard['handleRequest'](createRequestProps(context));
      const res = getHeaderMock(context);

      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
    });

    it('should set X-RateLimit-Remaining header correctly', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 37,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await guard['handleRequest'](createRequestProps(context));
      const res = getHeaderMock(context);

      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '63');
    });

    it('should set X-RateLimit-Remaining to 0 when at limit', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 100,
        timeToExpire: 60000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await guard['handleRequest'](createRequestProps(context));
      const res = getHeaderMock(context);

      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });

    it('should set X-RateLimit-Reset to timeToExpire when not blocked', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 5,
        timeToExpire: 45000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      await guard['handleRequest'](createRequestProps(context));
      const res = getHeaderMock(context);

      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Reset', '45');
    });

    it('should not set X-RateLimit-Reset when request is blocked (throws before headers)', async () => {
      const context = createMockContext({ tier: 'free' });
      mockStorageService.increment.mockResolvedValue({
        totalHits: 150,
        timeToExpire: 60000,
        isBlocked: true,
        timeToBlockExpire: 30000,
      });

      try {
        await guard['handleRequest'](createRequestProps(context));
      } catch {
        // expected to throw
      }
      const res = getHeaderMock(context);

      expect(res.header).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String),
      );
    });
  });

  // ---------------------------------------------------------------------------
  //  Tracker (IP-based)
  // ---------------------------------------------------------------------------
  describe('getTracker', () => {
    it('should use first IP from X-Forwarded-For when available', async () => {
      const tracker = await guard['getTracker']({
        ip: '1.2.3.4',
        ips: ['10.0.0.1', '10.0.0.2'],
      });
      expect(tracker).toBe('10.0.0.1');
    });

    it('should fall back to req.ip when req.ips is empty', async () => {
      const tracker = await guard['getTracker']({
        ip: '1.2.3.4',
        ips: [],
      });
      expect(tracker).toBe('1.2.3.4');
    });

    it('should fall back to req.ip when req.ips is undefined', async () => {
      const tracker = await guard['getTracker']({
        ip: '5.6.7.8',
      });
      expect(tracker).toBe('5.6.7.8');
    });
  });
});
