import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    const validDto: LoginDto = {
      email: 'test@example.com',
      password: 'Test1234!',
    };

    it('should call authService.login with correct DTO', async () => {
      const expectedToken = { access_token: 'jwt-token' };
      mockAuthService.login.mockResolvedValue(expectedToken);

      const result = await controller.login(validDto);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(authService.login).toHaveBeenCalledWith(validDto);
      expect(result).toEqual(expectedToken);
    });

    it('should throw UnauthorizedException when authService throws', async () => {
      mockAuthService.login.mockRejectedValue(new UnauthorizedException());

      const dto: LoginDto = {
        email: 'wrong@example.com',
        password: 'WrongPass1!',
      };

      await expect(controller.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should propagate authService errors', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      const dto: LoginDto = {
        email: 'bad@example.com',
        password: 'BadPass123!',
      };

      await expect(controller.login(dto)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });
});
