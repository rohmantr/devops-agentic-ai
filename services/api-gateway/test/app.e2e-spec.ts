import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request_ from 'supertest';
import { AppModule } from './../src/app.module';

const request = (request_ as any).default || request_;
const req = request;

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return req(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
