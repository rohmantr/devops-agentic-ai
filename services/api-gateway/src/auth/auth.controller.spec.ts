import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
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

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signup', () => {
    it('should register a new user with email and password', async () => {
      const dto = { email: 'newuser@example.com', password: 'password123' };
      const result = await controller.signup(dto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', 'newuser@example.com');
      expect(result).toHaveProperty('tier', 'free');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should register a new user with pro tier', async () => {
      const dto = {
        email: 'prouser@example.com',
        password: 'password123',
        tier: 'pro' as const,
      };
      const result = await controller.signup(dto);

      expect(result.tier).toBe('pro');
    });

    it('should register a user with default free tier when tier not specified', async () => {
      const dto = { email: 'defaultuser@example.com', password: 'password123' };
      const result = await controller.signup(dto);

      expect(result.tier).toBe('free');
    });
  });

  describe('login', () => {
    it('should return JWT token for valid credentials', async () => {
      // First sign up
      const signupDto = {
        email: 'logintest@example.com',
        password: 'password123',
      };
      await controller.signup(signupDto);

      // Then login
      const loginDto = {
        email: 'logintest@example.com',
        password: 'password123',
      };
      const result = await controller.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(typeof result.access_token).toBe('string');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const signupDto = {
        email: 'wrongpass@example.com',
        password: 'password123',
      };
      await controller.signup(signupDto);

      const loginDto = {
        email: 'wrongpass@example.com',
        password: 'wrongpassword',
      };

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return the authenticated user', () => {
      const mockRequest = {
        user: { id: 'user-1', email: 'test@example.com', tier: 'pro' as const },
      };

      const result = controller.getProfile(mockRequest);

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        tier: 'pro',
      });
    });

    it('should return user with free tier', () => {
      const mockRequest = {
        user: {
          id: 'user-2',
          email: 'free@example.com',
          tier: 'free' as const,
        },
      };

      const result = controller.getProfile(mockRequest);

      expect(result.tier).toBe('free');
    });
  });
});
