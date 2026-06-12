import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const validDto: LoginDto = {
      email: 'test@example.com',
      password: 'Test1234!',
    };

    it('should return access_token for valid credentials', async () => {
      const result = await service.login(validDto);
      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('should sign JWT with correct payload for valid credentials', async () => {
      const signSpy = jest.spyOn(jwtService, 'signAsync');
      await service.login(validDto);
      expect(signSpy).toHaveBeenCalledWith({
        sub: 'user_123',
        email: validDto.email,
      });
    });

    it('should throw UnauthorizedException for wrong email', async () => {
      const dto: LoginDto = {
        email: 'wrong@example.com',
        password: 'Test1234!',
      };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'WrongPassword1!',
      };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for empty password', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: '',
      };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      const dto: LoginDto = {
        email: 'nonexistent@test.com',
        password: 'SomePass123!',
      };
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });
});
