import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { BadRequestException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user with hashed password', async () => {
    const email = 'test@example.com';
    const password = 'password123';

    const user = await service.create(email, password);
    expect(user.id).toBeDefined();
    expect(user.email).toBe(email);
    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe(password);
  });

  it('should throw BadRequestException when email already exists', async () => {
    const email = 'duplicate@example.com';
    const password = 'password123';

    await service.create(email, password);
    await expect(service.create(email, password)).rejects.toThrow(BadRequestException);
  });
});
