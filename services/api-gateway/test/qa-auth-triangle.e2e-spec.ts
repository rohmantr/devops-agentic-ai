import request from 'supertest';
import { App } from 'supertest/types';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('QA Authentication Triangle Tests (TypeScript)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set throttler parameters to high values to bypass rate limiting in QA tests
    process.env.THROTTLER_TTL = '60';
    process.env.THROTTLER_LIMIT = '1000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLER_TTL;
    delete process.env.THROTTLER_LIMIT;
  });

  const uniqueEmail = `qa-triangle-${Date.now()}@example.com`;
  const password = 'SecurePassword123!';

  // --- 1. HAPPY PATH SCENARIOS ---
  describe('Happy Path', () => {
    it('POST /auth/signup & POST /auth/login -> GET /auth/profile', async () => {
      // 1. Sign up successfully
      const signupRes = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: uniqueEmail, password })
        .expect(201);

      const signupBody = signupRes.body as { id: string; email: string };
      expect(signupBody).toHaveProperty('id');
      expect(signupBody).toHaveProperty('email', uniqueEmail);
      expect(signupBody).not.toHaveProperty('password');

      // 2. Log in with matching credentials to obtain JWT token
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail, password })
        .expect(201);

      const loginBody = loginRes.body as { access_token: string };
      expect(loginBody).toHaveProperty('access_token');
      const token = loginBody.access_token;

      // 3. Access protected profile route using the token
      const profileRes = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileRes.body).toHaveProperty('id', signupBody.id);
      expect(profileRes.body).toHaveProperty('email', uniqueEmail);
    });
  });

  // --- 2. NEGATIVE PATH SCENARIOS ---
  describe('Negative Path / Validation & Credentials', () => {
    it('POST /auth/signup -> reject duplicate emails with 400', async () => {
      const email = `duplicate-qa-${Date.now()}@example.com`;

      // Register once
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password })
        .expect(201);

      // Register again with the same email
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password })
        .expect(400);
    });

    const badPayloads = [
      { name: 'empty email', payload: { email: '', password } },
      {
        name: 'invalid email format',
        payload: { email: 'invalid-email', password },
      },
      {
        name: 'empty password',
        payload: { email: 'test@example.com', password: '' },
      },
      { name: 'missing email field', payload: { password } },
      {
        name: 'missing password field',
        payload: { email: 'test@example.com' },
      },
    ];

    badPayloads.forEach(({ name, payload }) => {
      it(`POST /auth/signup -> reject validation failure: ${name} with 400`, async () => {
        await request(app.getHttpServer())
          .post('/auth/signup')
          .send(payload)
          .expect(400);
      });
    });

    it('POST /auth/login -> reject incorrect password with 401', async () => {
      const email = `login-fail-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'WrongPassword123' })
        .expect(401);
    });

    it('POST /auth/login -> reject non-existent user with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nonexistent-qa@example.com', password })
        .expect(401);
    });
  });

  // --- 3. BOUNDARY / SECURITY SCENARIOS ---
  describe('Security Boundary Path (Protected Routes)', () => {
    it('GET /auth/profile -> reject request without Authorization header with 401', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('GET /auth/profile -> reject request with invalid/malformed token with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token-string')
        .expect(401);
    });

    it('GET /auth/profile -> reject request with malformed authorization header with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Basic YWRtaW46c2VjcmV0')
        .expect(401);
    });

    it('GET /auth/profile -> reject request with expired token structure with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer ')
        .expect(401);
    });
  });
});
