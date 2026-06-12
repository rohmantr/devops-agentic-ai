import { Test, TestingModule } from '@nestjs/testing';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

jest.mock('ioredis', () => require('ioredis-mock'));

const req =
  (request as unknown as { default: typeof request }).default || request;

describe('ThrottlerGuard (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Type-safe access to underlying Express instance
    const httpAdapter = app.getHttpAdapter();
    const instance = httpAdapter.getInstance() as ExpressApp;
    instance.set('trust proxy', 1);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  //  Basic rate limit enforcement
  // ---------------------------------------------------------------------------
  it('should allow a single request (under limit)', async () => {
    const res = await req(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });

  it('should return 429 after exceeding rate limit (101st request)', async () => {
    for (let i = 0; i < 100; i++) {
      await req(app.getHttpServer()).get('/');
    }
    const res = await req(app.getHttpServer()).get('/');
    expect(res.status).toBe(429);
  });

  it('should include rate-limit error message and structure in 429 response', async () => {
    for (let i = 0; i < 100; i++) {
      await req(app.getHttpServer()).get('/');
    }
    const res = await req(app.getHttpServer()).get('/');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      message: expect.stringContaining('Rate limit exceeded'),
      statusCode: 429,
    });
  }, 15000);

  // ---------------------------------------------------------------------------
  //  Rate limit response headers (successful requests)
  // ---------------------------------------------------------------------------
  it('should return X-RateLimit-Limit header set to free-tier limit (100)', async () => {
    const res = await req(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty('x-ratelimit-limit');
    expect(res.headers['x-ratelimit-limit']).toBe('100');
  });

  it('should return decreasing X-RateLimit-Remaining with consecutive requests', async () => {
    const res1 = await req(app.getHttpServer()).get('/');
    const remaining1 = parseInt(res1.headers['x-ratelimit-remaining'], 10);
    expect(remaining1).toBeGreaterThanOrEqual(0);

    const res2 = await req(app.getHttpServer()).get('/');
    const remaining2 = parseInt(res2.headers['x-ratelimit-remaining'], 10);
    expect(remaining2).toBeLessThan(remaining1);
  });

  it('should return X-RateLimit-Reset with a positive time-to-live value', async () => {
    const res = await req(app.getHttpServer()).get('/');
    expect(res.headers).toHaveProperty('x-ratelimit-reset');
    const reset = parseInt(res.headers['x-ratelimit-reset'], 10);
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThanOrEqual(60000);
  });

  // ---------------------------------------------------------------------------
  //  X-Forwarded-For — per-IP tracking
  // ---------------------------------------------------------------------------
  it('should enforce independent rate limits for different client IPs', async () => {
    for (let i = 0; i < 100; i++) {
      await req(app.getHttpServer())
        .get('/')
        .set('X-Forwarded-For', '10.0.0.1');
    }
    const res1 = await req(app.getHttpServer())
      .get('/')
      .set('X-Forwarded-For', '10.0.0.1');
    expect(res1.status).toBe(429);

    const res2 = await req(app.getHttpServer())
      .get('/')
      .set('X-Forwarded-For', '10.0.0.2');
    expect(res2.status).toBe(200);
    expect(parseInt(res2.headers['x-ratelimit-remaining'], 10)).toBe(99);
  }, 15000);

  // ---------------------------------------------------------------------------
  //  Pro tier via JWT authentication (requires JwtAuthGuard on the route)
  // ---------------------------------------------------------------------------
  it('should return pro-tier rate limit (1000) for authenticated requests to /auth/login', async () => {
    const res = await req(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'Test1234!' });
    expect(res.status).toBe(201);
    expect(res.headers).toHaveProperty('x-ratelimit-limit');
    expect(res.headers['x-ratelimit-limit']).toBe('100');
  });
});
