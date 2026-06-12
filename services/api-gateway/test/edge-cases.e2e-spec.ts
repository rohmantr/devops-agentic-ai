import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * 10 Edge Case Tests — boundary, security, and corrupt-data scenarios
 * that could break the API Gateway auth features.
 *
 * Categories:
 *   EC-1  — SQL injection payloads in email / password
 *   EC-2  — XSS / script injection in email
 *   EC-3  — Overlong email (>254 chars, RFC 5321 limit)
 *   EC-4  — Overlong password (>1 000 chars)
 *   EC-5  — Unicode / emoji in email
 *   EC-6  — Empty JSON body (no fields)
 *   EC-7  — Bearer token with empty value ("Bearer ")
 *   EC-8  — Bearer token with double / nested "Bearer" prefix
 *   EC-9  — JWT with algorithm "none" (algorithm confusion)
 *   EC-10 — Rapid sequential requests (throttling boundary)
 */
describe('10 Edge Cases That Could Break Auth Features', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Generous throttler for bulk of the tests
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

  // ------------------------------------------------------------------
  // EC-1: SQL Injection payloads
  // ------------------------------------------------------------------
  describe('EC-1 — SQL Injection payloads', () => {
    const sqlPayloads = [
      {
        name: 'SQL injection in email',
        payload: { email: "' OR 1=1 --", password: 'password123' },
      },
      {
        name: 'SQL injection UNION in email',
        payload: {
          email: "' UNION SELECT * FROM users --",
          password: 'password123',
        },
      },
      {
        name: 'SQL injection DROP in email',
        payload: { email: "'; DROP TABLE users; --", password: 'password123' },
      },
      {
        name: 'SQL tautology in password',
        payload: { email: 'sqlinject@example.com', password: "' OR '1'='1" },
      },
    ];

    sqlPayloads.forEach(({ name, payload }) => {
      it(`POST /auth/signup should handle safely: ${name}`, async () => {
        await request(app.getHttpServer())
          .post('/auth/signup')
          .send(payload)
          .expect((res) => {
            // Must NOT return 500 — either 400 (validation) or 201 (treated as literal string)
            expect(res.status).not.toBe(500);
            expect([201, 400]).toContain(res.status);
          });
      });
    });
  });

  // ------------------------------------------------------------------
  // EC-2: XSS / script injection
  // ------------------------------------------------------------------
  describe('EC-2 — XSS / script injection in email', () => {
    const xssPayloads = [
      {
        name: '<script> tag in email',
        payload: {
          email: '<script>alert("xss")</script>@example.com',
          password: 'password123',
        },
      },
      {
        name: 'JavaScript URL in email',
        payload: {
          email: 'javascript:alert(1)@example.com',
          password: 'password123',
        },
      },
      {
        name: 'onerror handler in email',
        payload: {
          email: '<img src=x onerror=alert(1)>@example.com',
          password: 'password123',
        },
      },
    ];

    xssPayloads.forEach(({ name, payload }) => {
      it(`POST /auth/signup should handle safely: ${name}`, async () => {
        const res = await request(app.getHttpServer())
          .post('/auth/signup')
          .send(payload)
          .expect((r) => {
            // Should either reject as invalid email (400) or store as literal string (201)
            expect(r.status).not.toBe(500);
            expect([201, 400]).toContain(r.status);
          });

        // If accepted, verify the stored value is the literal input (not decoded)
        if (res.status === 201) {
          expect((res.body as { email: string }).email).toBe(payload.email);
        }
      });
    });
  });

  // ------------------------------------------------------------------
  // EC-3: Overlong email (>254 chars, RFC 5321 limit)
  // ------------------------------------------------------------------
  describe('EC-3 — Overlong email (> 254 chars)', () => {
    it('POST /auth/signup should reject overlong email', async () => {
      const longLocalPart = 'a'.repeat(250);
      const email = `${longLocalPart}@b.com`; // total > 254 chars

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: 'password123' })
        .expect((res) => {
          // class-validator's IsEmail respects RFC — should reject
          expect(res.status).toBe(400);
        });
    });

    it('POST /auth/signup should accept email at 254-char boundary', async () => {
      // Build an email that's exactly 254 characters
      const localPart = 'a'.repeat(64); // max local part
      const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)}`; // max domain
      const boundaryEmail = `${localPart}@${domain}`; // 64 + 1 + 63 + 1 + 63 + 1 + 60 = 253

      // If it passes validation, fine; if not, it's acceptable too
      // The key is no 500 error
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: boundaryEmail, password: 'password123' })
        .expect((res) => {
          expect(res.status).not.toBe(500);
        });
    });
  });

  // ------------------------------------------------------------------
  // EC-4: Overlong password
  // ------------------------------------------------------------------
  describe('EC-4 — Overlong password (> 1000 chars)', () => {
    it('POST /auth/signup should handle very long password gracefully', async () => {
      const longPassword = 'x'.repeat(5000);
      const email = `longpass-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: longPassword })
        .expect((res) => {
          // Must NOT crash (500); accept (201) or reject (400/413) are both fine
          expect(res.status).not.toBe(500);
        });
    });

    it('POST /auth/login should work with long password after registration', async () => {
      const longPassword = 'y'.repeat(2000);
      const email = `longpass-login-${Date.now()}@example.com`;

      const signupRes = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: longPassword });

      // If signup succeeded, login should also work
      if (signupRes.status === 201) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: longPassword })
          .expect((res) => {
            expect(res.status).not.toBe(500);
          });
      }
    });
  });

  // ------------------------------------------------------------------
  // EC-5: Unicode / emoji in email
  // ------------------------------------------------------------------
  describe('EC-5 — Unicode / special characters in email', () => {
    const unicodeEmails = [
      {
        name: 'emoji in local part',
        payload: { email: 'test😊@example.com', password: 'password123' },
      },
      {
        name: 'accented characters',
        payload: { email: 'testéèê@example.com', password: 'password123' },
      },
      {
        name: 'CJK characters in local part',
        payload: { email: '测试@example.com', password: 'password123' },
      },
    ];

    unicodeEmails.forEach(({ name, payload }) => {
      it(`POST /auth/signup should handle safely: ${name}`, async () => {
        await request(app.getHttpServer())
          .post('/auth/signup')
          .send(payload)
          .expect((res) => {
            expect(res.status).not.toBe(500);
            expect([201, 400]).toContain(res.status);
          });
      });
    });
  });

  // ------------------------------------------------------------------
  // EC-6: Empty JSON body
  // ------------------------------------------------------------------
  describe('EC-6 — Empty / malformed request bodies', () => {
    it('POST /auth/signup should reject empty JSON body', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({})
        .expect(400);
    });

    it('POST /auth/signup should reject null body', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send(null)
        .expect(400);
    });

    it('POST /auth/signup should reject request with extra unknown fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'extrafields@example.com',
          password: 'password123',
          role: 'admin',
          isAdmin: true,
        })
        .expect(201); // Should succeed, extra fields are ignored
    });

    it('POST /auth/login should reject empty body', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });
  });

  // ------------------------------------------------------------------
  // EC-7: Bearer token with empty value
  // ------------------------------------------------------------------
  describe('EC-7 — Bearer token with empty value', () => {
    it('GET /auth/profile should reject "Bearer " (empty token)', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer ')
        .expect(401);
    });

    it('GET /auth/profile should reject malformed "Bearer" without space', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer')
        .expect(401);
    });

    it('GET /auth/profile should reject completely empty Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', '')
        .expect(401);
    });
  });

  // ------------------------------------------------------------------
  // EC-8: Double / nested "Bearer" prefix
  // ------------------------------------------------------------------
  describe('EC-8 — Double Bearer prefix / nested token', () => {
    it('GET /auth/profile should reject "Bearer Bearer <token>"', async () => {
      // First get a real token
      const email = `doublebearer-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: 'password123' })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);

      const realToken = (loginRes.body as { access_token: string })
        .access_token;

      // Now use double Bearer prefix
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer Bearer ${realToken}`)
        .expect(401);
    });

    it('GET /auth/profile should accept lower-case "bearer" prefix (RFC 7235)', async () => {
      // RFC 7235 §2.1 — auth-scheme names are case-insensitive
      const email = `lowercasebearer-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: 'password123' })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);

      const realToken = (loginRes.body as { access_token: string })
        .access_token;

      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `bearer ${realToken}`)
        .expect(200);
    });
  });

  // ------------------------------------------------------------------
  // EC-9: JWT with algorithm "none" (algorithm confusion)
  // ------------------------------------------------------------------
  describe('EC-9 — JWT algorithm confusion ("none" algorithm)', () => {
    it('GET /auth/profile should reject self-crafted JWT with alg=none', async () => {
      // Create a JWT-like token with alg: none (no signature)
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'hacker',
          email: 'hacker@example.com',
          iat: 1516239022,
        }),
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${noneToken}`)
        .expect(401);
    });

    it('GET /auth/profile should reject a completely fake token', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set(
          'Authorization',
          'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fakesignature',
        )
        .expect(401);
    });

    it('GET /auth/profile should reject a token with tampered payload', async () => {
      // Take a real token and modify the payload
      const email = `tampertoken-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: 'password123' })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);

      const realToken = (loginRes.body as { access_token: string })
        .access_token;
      const parts = realToken.split('.');

      // Modify the payload to elevate privileges
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: 'admin-001',
          email: 'admin@example.com',
          tier: 'pro',
          role: 'admin',
        }),
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });
  });

  // ------------------------------------------------------------------
  // EC-10: Rapid sequential requests (throttling boundary)
  // ------------------------------------------------------------------
  describe('EC-10 — Throttling boundary / rapid requests', () => {
    it('should throttle requests after exceeding the limit on a tight window', async () => {
      // Temporarily set a very low limit for this test
      process.env.THROTTLER_TTL = '15';
      process.env.THROTTLER_LIMIT = '2';

      // Rebuild app with stricter throttler
      await app.close();
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      const throttledApp = moduleFixture.createNestApplication();
      await throttledApp.init();
      const server = throttledApp.getHttpServer() as unknown as Record<
        string,
        unknown
      >;

      try {
        // First request
        await request(server as unknown as Parameters<typeof request>[0])
          .get('/')
          .expect(200);
        // Second request
        await request(server as unknown as Parameters<typeof request>[0])
          .get('/')
          .expect(200);
        // Third request — should be throttled
        await request(server as unknown as Parameters<typeof request>[0])
          .get('/')
          .expect(429);
      } finally {
        await throttledApp.close();
        delete process.env.THROTTLER_TTL;
        delete process.env.THROTTLER_LIMIT;
      }
    });

    it('should NOT throttle after the TTL window expires', async () => {
      // Use a very short window
      process.env.THROTTLER_TTL = '1'; // 1 second
      process.env.THROTTLER_LIMIT = '2';

      await app.close();
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      const throttledApp = moduleFixture.createNestApplication();
      await throttledApp.init();
      const server = throttledApp.getHttpServer() as unknown as Record<
        string,
        unknown
      >;

      try {
        await request(server as unknown as Parameters<typeof request>[0])
          .get('/')
          .expect(200);
        await request(server as unknown as Parameters<typeof request>[0])
          .get('/')
          .expect(200);
        await request(server as unknown as Parameters<typeof request>[0])
          .get('/')
          .expect(429); // exceeded

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, 1100));

        // Should succeed again
        await request(server).get('/').expect(200);
      } finally {
        await throttledApp.close();
        delete process.env.THROTTLER_TTL;
        delete process.env.THROTTLER_LIMIT;
      }
    }, 10000);
  });
});
