import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('ThrottlerGuard (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Set custom rate limit parameters for testing
    process.env.THROTTLER_TTL = '10';
    process.env.THROTTLER_LIMIT = '3';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.THROTTLER_TTL;
    delete process.env.THROTTLER_LIMIT;
  });

  it('should throttle requests after limit is exceeded', async () => {
    const server = app.getHttpServer();

    // Call 1
    await request(server).get('/').expect(200);

    // Call 2
    await request(server).get('/').expect(200);

    // Call 3
    await request(server).get('/').expect(200);

    // Call 4: should be throttled (429 Too Many Requests)
    await request(server).get('/').expect(429);
  });
});
