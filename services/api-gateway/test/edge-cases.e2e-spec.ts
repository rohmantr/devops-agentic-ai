import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthModule } from './../src/auth/auth.module';

describe('Edge Cases (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('EC-1: SQL Injection in login fields', () => {
    it('should reject SQL injection in email field', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: "' OR '1'='1", password: 'Test1234!' })
        .expect(400);
    });

    it('should reject SQL injection in password field', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: "' OR '1'='1" })
        .expect(401);
    });

    it('should handle UNION injection attempt safely', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: "' UNION SELECT * FROM users--", password: 'Test1234!' })
        .expect(400);
    });
  });

  describe('EC-2: XSS Injection', () => {
    it('should reject XSS script tag in email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: '<script>alert("xss")</script>', password: 'Test1234!' })
        .expect(400);
    });

    it('should handle XSS in password field', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: '<img src=x onerror=alert(1)>',
        })
        .expect(401);
    });
  });

  describe('EC-3: Overlong email', () => {
    it('should reject overly long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: longEmail, password: 'Test1234!' })
        .expect(400);
    });

    it('should reject email with long local part', () => {
      const longLocal = 'a'.repeat(65) + '@example.com';
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: longLocal, password: 'Test1234!' })
        .expect(400);
    });
  });

  describe('EC-4: Long password', () => {
    it('should handle very long password without crashing', () => {
      const longPass = 'A1!' + 'x'.repeat(5000);
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: longPass })
        .expect(401);
    });
  });

  describe('EC-5: Unicode / special characters', () => {
    it('should handle unicode email (no 500 error)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'üser@example.com', password: 'Test1234!' })
        .expect(401);
    });

    it('should handle emoji in password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: '😀🔥👍Test!' })
        .expect(401);
    });
  });

  describe('EC-6: Missing / empty fields', () => {
    it('should reject empty JSON body', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject missing email field', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'Test1234!' })
        .expect(400);
    });

    it('should reject missing password field', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com' })
        .expect(400);
    });

    it('should reject empty email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: '', password: 'Test1234!' })
        .expect(400);
    });

    it('should reject empty password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: '' })
        .expect(400);
    });

    it('should reject whitespace-only email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: '   ', password: 'Test1234!' })
        .expect(400);
    });

    it('should reject short password (less than 8 chars)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'Ab1' })
        .expect(400);
    });

    it('should strip unknown fields (whitelist)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test1234!',
          extraField: 'should be stripped',
        })
        .expect(201);
    });
  });

  describe('EC-7: Invalid email format', () => {
    it('should reject invalid email "not-an-email"', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'Test1234!' })
        .expect(400);
    });

    it('should reject email without domain', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@', password: 'Test1234!' })
        .expect(400);
    });

    it('should reject email with spaces', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user @example.com', password: 'Test1234!' })
        .expect(400);
    });
  });

  describe('EC-8: Boundary - valid credentials edge', () => {
    it('should successfully login with exactly 8 char password (minimum)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'Test1234!' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
        });
    });

    it('should successfully login for case-sensitive email mismatch (caps)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'TEST@example.com', password: 'Test1234!' })
        .expect(201);
    });
  });

  describe('EC-9: Malformed request', () => {
    it('should reject non-JSON body', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('not-json-at-all')
        .expect(400);
    });

    it('should reject null body', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send(null)
        .expect(400);
    });

    it('should reject array body', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send(['test@example.com', 'Test1234!'])
        .expect(400);
    });
  });

  describe('EC-10: Numeric / type confusion', () => {
    it('should reject numeric email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 12345, password: 'Test1234!' })
        .expect(400);
    });

    it('should reject numeric password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 12345678 })
        .expect(400);
    });

    it('should reject boolean email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: true, password: 'Test1234!' })
        .expect(400);
    });
  });
});
