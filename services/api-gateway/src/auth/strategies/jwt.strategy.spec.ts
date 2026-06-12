import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'JWT_SECRET') return 'test-secret-key';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user object from valid payload', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'pro' as const,
      };
      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        tier: 'pro',
      });
    });

    it('should use default "free" tier when tier is not provided', async () => {
      const payload = { sub: 'user-456', email: 'free@example.com' };
      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: 'user-456',
        email: 'free@example.com',
        tier: 'free',
      });
    });

    it('should handle undefined tier in payload', async () => {
      const payload = {
        sub: 'user-789',
        email: 'test@example.com',
        tier: undefined,
      };
      const result = await strategy.validate(payload);

      expect(result.tier).toBe('free');
    });
  });
});
