import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { locations, users } from '../src/lib/db/schema';
import { createFirstAdmin, needsSetup } from '../src/lib/domain/setup';
import { DomainError } from '../src/lib/domain/errors';
import { makeTestDb } from './helpers';

describe('first-run setup', () => {
  test('creates one administrator and the counter location', async () => {
    const { db, close } = await makeTestDb();
    try {
      assert.equal(await needsSetup(db), true);
      const admin = await createFirstAdmin(db, {
        name: 'Ada',
        email: 'ada@example.com',
        password: 'a-long-password',
      });
      assert.equal(admin.role, 'admin');
      assert.equal(await needsSetup(db), false);

      const codes = (await db.select().from(locations)).map((l) => l.code).sort();
      assert.deepEqual(codes, ['COUNTER', 'STAGING']);
    } finally {
      await close();
    }
  });

  test('refuses to run a second time', async () => {
    const { db, close } = await makeTestDb();
    try {
      await createFirstAdmin(db, { name: 'Ada', email: 'ada@example.com', password: 'a-long-password' });
      await assert.rejects(
        createFirstAdmin(db, { name: 'Eve', email: 'eve@example.com', password: 'another-password' }),
        (err: unknown) => err instanceof DomainError && err.code === 'ALREADY_SET_UP',
      );
      assert.equal((await db.select().from(users)).length, 1);
    } finally {
      await close();
    }
  });

  test('rejects a short password', async () => {
    const { db, close } = await makeTestDb();
    try {
      await assert.rejects(
        createFirstAdmin(db, { name: 'Ada', email: 'ada@example.com', password: 'short' }),
        DomainError,
      );
      assert.equal(await needsSetup(db), true);
    } finally {
      await close();
    }
  });
});
