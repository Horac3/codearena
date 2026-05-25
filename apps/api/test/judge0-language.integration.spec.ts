// Integration test for Judge0LanguageService.
// Starts an in-process HTTP server to mock Judge0's /languages endpoint,
// verifies the service fetches and caches language IDs correctly.

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Judge0LanguageService } from '../src/judge0/judge0-language.service';
import * as http from 'http';

describe('Judge0LanguageService', () => {
  let service: Judge0LanguageService;
  let configService: ConfigService;
  let mockServer: http.Server;
  let port: number;

  const mockLanguages = [
    { id: 93, name: 'JavaScript (Node.js 18.0.0)' },
    { id: 94, name: 'TypeScript (5.3)' },
    { id: 71, name: 'Python (3.11.2)' },
    { id: 95, name: 'Go (1.21)' },
    { id: 62, name: 'Java (OpenJDK 17)' },
    { id: 50, name: 'C (GCC 9.2.0)' },
  ];

  beforeAll(async () => {
    // Start a mock Judge0 server on a random port
    mockServer = http.createServer((req, res) => {
      if (req.url === '/languages' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockLanguages));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, () => resolve());
    });

    port = (mockServer.address() as any).port;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Judge0LanguageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              if (key === 'JUDGE0_URL') return `http://localhost:${port}`;
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<Judge0LanguageService>(Judge0LanguageService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('fetches language IDs from Judge0 on init', async () => {
    await service.onModuleInit();

    expect(service.isResolved()).toBe(true);
  });

  it('resolves JavaScript to Judge0 language ID 93', async () => {
    await service.onModuleInit();
    expect(service.resolve('javascript')).toBe(93);
  });

  it('resolves Python to Judge0 language ID 71', async () => {
    await service.onModuleInit();
    expect(service.resolve('python')).toBe(71);
  });

  it('resolves Go to Judge0 language ID 95', async () => {
    await service.onModuleInit();
    expect(service.resolve('go')).toBe(95);
  });

  it('resolves TypeScript to Judge0 language ID 94', async () => {
    await service.onModuleInit();
    expect(service.resolve('typescript')).toBe(94);
  });

  it('resolves Java to Judge0 language ID 62', async () => {
    await service.onModuleInit();
    expect(service.resolve('java')).toBe(62);
  });

  it('throws for unsupported languages', async () => {
    await service.onModuleInit();
    expect(() => service.resolve('ruby')).toThrow(
      'Language "ruby" not found in Judge0 language map',
    );
  });

  it('falls back to hardcoded IDs when Judge0 is unreachable', async () => {
    // Create a service pointing at a port with nothing listening
    const fallbackModule: TestingModule = await Test.createTestingModule({
      providers: [
        Judge0LanguageService,
        {
          provide: ConfigService,
          useValue: {
            get: (_key: string, defaultValue?: string) => defaultValue,
          },
        },
      ],
    }).compile();

    const fallbackService = fallbackModule.get<Judge0LanguageService>(
      Judge0LanguageService,
    );

    await fallbackService.onModuleInit();

    expect(fallbackService.isResolved()).toBe(false);
    expect(fallbackService.resolve('javascript')).toBe(93);
    expect(fallbackService.resolve('typescript')).toBe(94);
    expect(fallbackService.resolve('python')).toBe(71);
    expect(fallbackService.resolve('go')).toBe(95);
  });
});
