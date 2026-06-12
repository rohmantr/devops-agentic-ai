import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AuthModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Set throttler parameters to high values to bypass rate limiting in auth e2e tests
    process.env.THROTTLER_TTL = '60';
    process.env.THROTTLER_LIMIT = '1000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.THROTTLER_TTL;
    delete process.env.THROTTLER_LIMIT;
  });

  const uniqueEmail = `test-${Date.now()}@example.com`;
  const password = 'password123';

  describe('POST /auth/signup', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: uniqueEmail, password })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', uniqueEmail);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should fail registration with invalid input', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'invalid-email', password: '' })
        .expect(400);
    });

    it('should fail registration if email is already taken', async () => {
      const email = `taken-${Date.now()}@example.com`;

      // Register once
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password })
        .expect(201);

      // Register again
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const loginEmail = `login-${Date.now()}@example.com`;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: loginEmail, password })
        .expect(201);
    });

    it('should issue a JWT token on successful login', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: loginEmail, password })
        .expect(201);

      const body = response.body as { access_token: string };
      expect(body).toHaveProperty('access_token');
      expect(typeof body.access_token).toBe('string');
    });

    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: loginEmail, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('GET /auth/profile', () => {
    const profileEmail = `profile-${Date.now()}@example.com`;
    let accessToken: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: profileEmail, password })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: profileEmail, password })
        .expect(201);

      const body = loginRes.body as { access_token: string };
      accessToken = body.access_token;
    });

    it('should allow access to a protected route with a valid JWT token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', profileEmail);
    });

    it('should deny access without a token', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('should deny access with an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401);
    });
  });
});
