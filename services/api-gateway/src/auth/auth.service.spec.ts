import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        UsersService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user and return user info without password hash', async () => {
      const email = 'register@example.com';
      const result = await service.register(email, 'password123');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', email);
      expect(result).toHaveProperty('tier', 'free');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should register a new user with pro tier', async () => {
      const email = 'register-pro@example.com';
      const result = await service.register(email, 'password123', 'pro');
      expect(result.tier).toBe('pro');
    });

    it('should propagate BadRequestException when email is taken', async () => {
      const email = 'takenreg@example.com';
      await service.register(email, 'password123');

      await expect(service.register(email, 'password123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should keep email exactly as provided (case-sensitive registration)', async () => {
      const email = 'MixedCaseReg@example.com';
      const result = await service.register(email, 'password123');
      expect(result.email).toBe(email);
    });
  });

  describe('validateUser', () => {
    it('should validate and return user if credentials match', async () => {
      const email = 'validate@example.com';
      await usersService.create(email, 'password123');

      const result = await service.validateUser(email, 'password123');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', email);
      expect(result).toHaveProperty('tier', 'free');
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
      await expect(
        service.validateUser('nonexistent@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const email = 'wrongpass@example.com';
      await usersService.create(email, 'password123');

      await expect(service.validateUser(email, 'wrongpass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for empty password', async () => {
      const email = 'emptypass@example.com';
      await usersService.create(email, 'password123');

      await expect(service.validateUser(email, '')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for whitespace-only password', async () => {
      const email = 'spacepass@example.com';
      await usersService.create(email, 'password123');

      await expect(service.validateUser(email, '   ')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should treat email lookup as case-sensitive', async () => {
      const email = 'CaseSensitiveValidate@example.com';
      await usersService.create(email, 'password123');

      // Different case should fail
      await expect(
        service.validateUser(
          'casesensitivevalidate@example.com',
          'password123',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return access token', () => {
      const user = {
        id: 'userid',
        email: 'test@example.com',
        tier: 'free' as const,
      };
      const response = service.login(user);
      expect(response).toEqual({ access_token: 'mock-jwt-token' });
    });

    it('should include the correct payload when signing JWT', () => {
      const user = {
        id: 'user-42',
        email: 'jwtpayload@example.com',
        tier: 'pro' as const,
      };
      service.login(user);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jwtService.sign).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockSign = jwtService.sign as jest.Mock;
      const callArgs = mockSign.mock.calls[0] as unknown[];
      expect(callArgs[0]).toEqual({
        email: 'jwtpayload@example.com',
        sub: 'user-42',
        tier: 'pro',
      });
    });

    it('should include tier in JWT payload for free users', () => {
      const user = {
        id: 'user-99',
        email: 'freeuser@example.com',
        tier: 'free' as const,
      };
      service.login(user);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jwtService.sign).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockSign = jwtService.sign as jest.Mock;
      const callArgs = mockSign.mock.calls[0] as unknown[];
      expect(callArgs[0]).toEqual({
        email: 'freeuser@example.com',
        sub: 'user-99',
        tier: 'free',
      });
    });
  });
});
