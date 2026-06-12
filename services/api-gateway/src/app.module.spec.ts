import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('AppModule', () => {
  it('should compile the module', async () => {
    process.env.JWT_SECRET = '***';
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module).toBeDefined();
    delete process.env.JWT_SECRET;
  });
});
