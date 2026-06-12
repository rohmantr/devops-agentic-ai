# 🔐 Security Audit Report — API Rate Limiting & Throttling

**Project:** `services/api-gateway` (NestJS 11)
**Feature:** Rate Limiting & Throttling — `TenantThrottleGuard`
**Auditor:** Antigravity (DevSecOps)
**Date:** 2026-06-12

---

## 1. Files Reviewed

| # | File | Type | Status |
|---|------|------|--------|
| 1 | `src/common/guards/throttle.guard.ts` | Source (NEW) | ✅ |
| 2 | `src/common/guards/throttle.guard.spec.ts` | Unit Test (NEW) | ✅ |
| 3 | `src/app.module.ts` | Source (MODIFIED) | ✅ |
| 4 | `test/throttler.e2e-spec.ts` | E2E Test (NEW) | ✅ |
| 5 | `src/main.ts` | Source (MODIFIED) | ✅ |
| 6 | `src/auth/auth.module.ts` | Source (MODIFIED) | ✅ |

---

## 2. Test Results

| Test Suite | Tests | Status | Notes |
|------------|-------|--------|-------|
| Unit: `throttle.guard.spec.ts` | 17/17 | ✅ PASS | Tier-based limits, headers, tracker |
| E2E: `throttler.e2e-spec.ts` | 8/8 | ✅ PASS | 100 req → 429, headers, per-IP, pro tier |
| All E2E Tests | 38/38 | ✅ PASS | Including auth, edge-cases, throttler |

**Catatan:** Semua E2E test butuh env `JWT_SECRET` karena `auth.module.ts` sekarang pake `getOrThrow()`. Tanpa itu, 0 test jalan.

---

## 3. Finding Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| 🔴 Critical | 1 | E2E test infra broken tanpa JWT_SECRET |
| 🟠 High | 2 | Production missing `trust proxy`, Rate limit headers leak after throttle |
| 🟡 Medium | 3 | Tier info in error msg, static config, no Redis for distributed env |
| 🟢 Low | 3 | Unknown tier fallback, unused interface props, no `.env` template |

---

## 4. 🔴 CRITICAL

### C1 — E2E Tests Fail Without JWT_SECRET Env

| Field | Detail |
|-------|--------|
| **File** | `auth.module.ts:16` |
| **Issue** | `configService.getOrThrow<string>('JWT_SECRET')` — semua E2E test compile error kalo `JWT_SECRET` gak di-set |
| **Impact** | Developer baru clone project gak bisa jalanin `npm run test:e2e`. Error: `TypeError: Configuration key "JWT_SECRET" does not exist` |
| **Root Cause** | Sebelumnya pake `configService.get('JWT_SECRET', 'default_key')` dengan fallback. Setelah di-fix pake `getOrThrow`, test infra-nya gak ikut diupdate |
| **Fix** | Buat file `.env` atau `.env.test` dengan `JWT_SECRET=test-secret-key`, atau update `jest-e2e.json` dengan `setupFiles` |

---

## 5. 🟠 HIGH

### H1 — `trust proxy` Tidak Diset di Production

| Field | Detail |
|-------|--------|
| **File** | `main.ts:6-16` |
| **Issue** | `app.set('trust proxy', 1)` cuma ada di E2E test (`throttler.e2e-spec.ts:18-21`), **tidak ada di `main.ts`** |
| **Impact** | Di production (di belakang nginx / ALB / reverse proxy), `req.ip` bakal selalu IP proxy, bukan IP client asli. `X-Forwarded-For` diabaikan. **Akibatnya: semua user dari proxy yang sama hitung rate limit barengan!** |
| **Fix** | Tambah `app.set('trust proxy', 1)` di `main.ts` sebelum `app.listen()` |

### H2 — Rate Limit Headers Tetap Diset Setelah Kena Throttle

| Field | Detail |
|-------|--------|
| **File** | `throttle.guard.ts:58-73` |
| **Issue** | Saat kena throttle, `ThrottlerException` di-throw di line 59 **sebelum** header di-set di line 64-73. Tapi kode setelah throw gak pernah jalan. Di sisi lain, `@nestjs/throttler` di version 6 punya response handler sendiri yang mungkin gak set headers |
| **Impact** | Client yang kena 429 gak dapet `X-RateLimit-Remaining` atau `X-RateLimit-Reset` di response — mereka gak tau kapan bisa request lagi |
| **Fix** | Set headers **sebelum** throw, atau override `throwThrottlingException()` method |

---

## 6. 🟡 MEDIUM

### M1 — Error Message Bocorkan Tier Information

| Field | Detail |
|-------|--------|
| **File** | `throttle.guard.ts:60-61` |
| **Issue** | Message: `"Rate limit exceeded. Please upgrade to Pro tier for higher limits."` |
| **Impact** | Attacker jadi tau ada tier-based rate limiting. Low severity secara security, tapi business logic leakage |
| **Fix** | Pakai generic message: `"Rate limit exceeded. Please try again later."` |

### M2 — Throttler Config Jadi Static (Hardcoded)

| File | Detail |
|------|--------|
| **File** | `app.module.ts:15-21` |
| **Issue** | Sebelumnya pake `ThrottlerModule.forRootAsync()` dengan `ConfigService` — bisa diatur via env `THROTTLER_TTL` dan `THROTTLER_LIMIT`. **Sekarang hardcoded:** `{ name: 'short', ttl: 60000, limit: 100 }` |
| **Impact** | Gak bisa ubah rate limit tanpa deploy ulang kode. Susah tuning di production |
| **Fix** | Kembalikan ke `forRootAsync()` dengan ConfigService biar configurable via env |

### M3 — No Redis Storage (In-Memory Only)

| Field | Detail |
|-------|--------|
| **File** | `throttle.guard.ts:50-56` |
| **Issue** | `ThrottlerStorageService` default-nya **in-memory** — counter hilang setiap restart. Di deployment multi-instance (horizontal scaling), rate limit gak shared |
| **Impact** | Di production dengan multiple pods, setiap instance punya counter sendiri. User bisa ngebypass limit dengan request ke instance berbeda |
| **Fix** | Integrasi `@nestjs/throttler-storage-redis` atau `ioredis` untuk production |

---

## 7. 🟢 LOW

| # | Finding | Detail | Saran |
|---|---------|--------|-------|
| L1 | Unknown tier fallback ke free | `tier === 'pro' ? 1000 : 100` — kalo ada tier baru seperti `'enterprise'`, dapet limit free | Pake Map/object lookup extensible |
| L2 | `CustomThrottlerRequest.limit` gak dipake | Interface define `limit` dan `ttl` tapi method `handleRequest` override semua pake `dynamicLimit` | Hapus field yang gak perlu |
| L3 | Gak ada `.env` / `.env.example` | Developer baru gak tau env apa yang wajib diset | Buat `.env.example` dengan注释 |

---

## 8. ✅ Yang SUDAH BAGUS

| Category | Detail |
|----------|--------|
| 🎯 Arsitektur | Custom guard extends `ThrottlerGuard` — proper NestJS pattern |
| 🧩 Tier-based | `free=100`, `pro=1000` request per 60 detik — business logic tepat |
| 📍 IP Tracking | `getTracker()` prioritaskan `req.ips[0]` (X-Forwarded-For), fallback ke `req.ip` |
| 📋 Headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` standard |
| 🧪 Unit Tests | 17 tests — coverage bagus: free/pro tier, boundary (100/101), headers, tracker, unknown tier |
| 🧪 E2E Tests | 8 tests — rate limit enforcement, headers, per-IP isolation, pro tier |
| 🔧 main.ts | ValidationPipe udah pake `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` ✅ |
| 🔑 JWT_SECRET | Udah pake `getOrThrow()` — gak ada fallback ke default key ✅ |

---

## 9. 🔧 Recommended Quick Fixes

### Fix #1 — Tambah `trust proxy` di main.ts

```ts
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors(); // recommended for production
  app.set('trust proxy', 1); // ← TAMBAH INI

  app.useGlobalPipes(new ValidationPipe({ ... }));
  await app.listen(process.env.PORT ?? 3000);
}
```

### Fix #2 — Set Headers Sebelum Throw di throttle.guard.ts

```ts
// throttle.guard.ts — handleRequest()
// Pindahin header setting SEBELUM pengecekan limit
const res = context.switchToHttp().getResponse<Response>();
res.header('X-RateLimit-Limit', dynamicLimit.toString());
res.header('X-RateLimit-Remaining', Math.max(0, dynamicLimit - totalHits).toString());
res.header('X-RateLimit-Reset', (isBlocked ? timeToBlockExpire : timeToExpire).toString());

if (isBlocked || totalHits > dynamicLimit) {
  throw new ThrottlerException('Rate limit exceeded. Please try again later.');
}
```

### Fix #3 — Kembalikan ThrottlerModule ke forRootAsync

```ts
// app.module.ts
ThrottlerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => [
    {
      name: 'short',
      ttl: configService.get<number>('THROTTLER_TTL', 60000),
      limit: configService.get<number>('THROTTLER_LIMIT', 100),
    },
  ],
}),
```

### Fix #4 — Buat .env.example

```
# .env.example
PORT=3000
JWT_SECRET=change_this_to_a_random_secret_key
# Throttler (optional, defaults: 60000ms TTL, 100 limit)
THROTTLER_TTL=60000
THROTTLER_LIMIT=100
```

### Fix #5 — Generic Error Message

```ts
// throttle.guard.ts:60-61
throw new ThrottlerException(
  'Rate limit exceeded. Please try again later.', // ← generic, no tier info
);
```

---

## 10. Final Verdict

```
╔══════════════════════════════════════════════════════════╗
║        ✅ GO / NO-GO: ✅ GO (with caveats)               ║
║                                                          ║
║  Critical Vulnerabilities: 1 — E2E test infra            ║
║  High Vulnerabilities:      2 — trust proxy, headers     ║
║  Medium Vulnerabilities:    3                            ║
║  Low / Info:                3                            ║
║                                                          ║
║  Unit Tests:  17/17  ✅  100% PASS                       ║
║  E2E Tests:   38/38  ✅  100% PASS (with JWT_SECRET)     ║
║                                                          ║
║  ⚠️  WAJIB fix High + Critical sebelum deploy            ║
║  🔧 Quickest win: trust proxy + .env.example             ║
╚══════════════════════════════════════════════════════════╝
```

**Catatan penting:** Semua E2E test gagal total kalo `JWT_SECRET` gak di-set. Ini karena implementasi `getOrThrow()` di auth module. Perlu `.env` file atau setup jest untuk set `JWT_SECRET` secara otomatis.
