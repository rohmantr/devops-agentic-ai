import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;

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
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('validateUser', () => {
    it('should validate and return user if credentials match', async () => {
      const email = 'validate@example.com';
      await usersService.create(email, 'password123');

      const result = await service.validateUser(email, 'password123');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', email);
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
  });

  describe('login', () => {
    it('should return access token', () => {
      const user = { id: 'userid', email: 'test@example.com' };
      const response = service.login(user);
      expect(response).toEqual({ access_token: 'mock-jwt-token' });
    });
  });
});
