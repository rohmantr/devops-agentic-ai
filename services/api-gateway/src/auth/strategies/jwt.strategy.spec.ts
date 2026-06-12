import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule } from '@nestjs/config';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [JwtStrategy],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user object from valid payload', () => {
      const payload = { sub: 'user_123', email: 'test@example.com' };
      const result = strategy.validate(payload);
      expect(result).toEqual({
        userId: 'user_123',
        email: 'test@example.com',
      });
    });

    it('should handle payload without email', () => {
      const payload = { sub: 'user_456' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = strategy.validate(payload as any) as Record<
        string,
        unknown
      >;
      expect(result.userId).toBe('user_456');
      expect(result.email).toBeUndefined();
    });

    it('should handle payload without sub', () => {
      const payload = { email: 'test@example.com' };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = strategy.validate(payload as any) as Record<
        string,
        unknown
      >;
      expect(result.email).toBe('test@example.com');
      expect(result.userId).toBeUndefined();
    });

    it('should handle empty payload', () => {
      const payload = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = strategy.validate(payload as any) as Record<
        string,
        unknown
      >;
      expect(result.userId).toBeUndefined();
      expect(result.email).toBeUndefined();
    });
  });
});
