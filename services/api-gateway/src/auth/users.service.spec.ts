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

  describe('create', () => {
    it('should create a user with hashed password and default free tier', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      const user = await service.create(email, password);
      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(password);
      expect(user.tier).toBe('free');
    });

    it('should create a user with pro tier when specified', async () => {
      const email = 'pro@example.com';
      const password = 'password123';

      const user = await service.create(email, password, 'pro');
      expect(user.tier).toBe('pro');
    });

    it('should throw BadRequestException when email already exists', async () => {
      const email = 'duplicate@example.com';
      const password = 'password123';

      await service.create(email, password);
      await expect(service.create(email, password)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate unique IDs for different users', async () => {
      const user1 = await service.create('user1@example.com', 'password123');
      const user2 = await service.create('user2@example.com', 'password123');

      expect(user1.id).not.toBe(user2.id);
    });

    it('should generate different salt for each password hash', async () => {
      const user1 = await service.create('salt1@example.com', 'samepassword');
      const user2 = await service.create('salt2@example.com', 'samepassword');

      expect(user1.passwordHash).not.toBe(user2.passwordHash);
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email after creation', async () => {
      const email = 'findme@example.com';
      const user = await service.create(email, 'password123');

      const found = await service.findByEmail(email);
      expect(found).toBeDefined();
      expect(found!.id).toBe(user.id);
      expect(found!.email).toBe(email);
    });

    it('should return undefined for non-existent email', async () => {
      const result = await service.findByEmail('nonexistent@example.com');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string email', async () => {
      const result = await service.findByEmail('');
      expect(result).toBeUndefined();
    });

    it('should be case-sensitive for email lookup', async () => {
      const email = 'CaseSensitive@example.com';
      await service.create(email, 'password123');

      // Different case should not find the user
      const wrongCase = await service.findByEmail('casesensitive@example.com');
      expect(wrongCase).toBeUndefined();

      // Exact case should find the user
      const exactCase = await service.findByEmail('CaseSensitive@example.com');
      expect(exactCase).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find a user by ID after creation', async () => {
      const email = 'findbyid@example.com';
      const user = await service.create(email, 'password123');

      const found = await service.findById(user.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(user.id);
      expect(found!.email).toBe(email);
    });

    it('should return undefined for non-existent ID', async () => {
      const result = await service.findById('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string ID', async () => {
      const result = await service.findById('');
      expect(result).toBeUndefined();
    });
  });
});
