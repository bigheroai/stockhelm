import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDatabaseTarget, resolveDatabaseUrl } from '../src/lib/db/target';

describe('database target parsing', () => {
  test('local development: no TLS, prepared statements on', () => {
    const t = parseDatabaseTarget('postgres://postgres:postgres@localhost:5432/stockroom');
    assert.equal(t.local, true);
    assert.equal(t.ssl, undefined);
    assert.equal(t.prepare, true);
    assert.equal(t.transactionPooler, false);
  });

  test('127.0.0.1 is treated as local', () => {
    assert.equal(parseDatabaseTarget('postgres://u:p@127.0.0.1:5432/db').local, true);
  });

  test('Supabase transaction pooler (:6543) disables prepared statements', () => {
    const t = parseDatabaseTarget(
      'postgresql://postgres.abcdefgh:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    );
    assert.equal(t.local, false);
    assert.equal(t.pooler, true);
    assert.equal(t.transactionPooler, true);
    assert.equal(t.prepare, false, 'PgBouncer transaction mode cannot prepare');
    assert.equal(t.ssl, 'require');
  });

  test('Supabase session pooler (:5432) keeps prepared statements', () => {
    const t = parseDatabaseTarget(
      'postgresql://postgres.abcdefgh:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    );
    assert.equal(t.pooler, true);
    assert.equal(t.transactionPooler, false);
    assert.equal(t.prepare, true);
  });

  test('Supabase direct host is not mistaken for a pooler', () => {
    const t = parseDatabaseTarget('postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres');
    assert.equal(t.pooler, false);
    assert.equal(t.ssl, 'require');
  });

  test('a plain VPS database gets TLS', () => {
    const t = parseDatabaseTarget('postgres://stockroom:pw@203.0.113.10:5432/stockroom');
    assert.equal(t.local, false);
    assert.equal(t.ssl, 'require');
    assert.equal(t.port, 5432);
  });

  test('an explicit override can force prepared statements off', () => {
    const previous = process.env.DATABASE_PREPARE;
    process.env.DATABASE_PREPARE = 'false';
    try {
      const t = parseDatabaseTarget('postgres://u:p@db.internal:5432/app');
      assert.equal(t.prepare, false);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_PREPARE;
      else process.env.DATABASE_PREPARE = previous;
    }
  });

  test('TLS can be disabled explicitly for a private network', () => {
    const previous = process.env.DATABASE_SSL;
    process.env.DATABASE_SSL = 'disable';
    try {
      assert.equal(parseDatabaseTarget('postgres://u:p@db.internal:5432/app').ssl, undefined);
    } finally {
      if (previous === undefined) delete process.env.DATABASE_SSL;
      else process.env.DATABASE_SSL = previous;
    }
  });
});

describe('connection string resolution', () => {
  test('DATABASE_URL wins when both are present', () => {
    assert.equal(
      resolveDatabaseUrl({ DATABASE_URL: 'postgres://a/db', SUPABASE_DATABASE_URL: 'postgres://b/db' }),
      'postgres://a/db',
    );
  });

  test('falls back to the value the Netlify integration injects', () => {
    assert.equal(
      resolveDatabaseUrl({ SUPABASE_DATABASE_URL: 'postgres://b/db' }),
      'postgres://b/db',
    );
  });

  test('blank values are treated as absent', () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: '  ', SUPABASE_DATABASE_URL: '' }), null);
  });

  test('null when nothing is configured (PGlite takes over)', () => {
    assert.equal(resolveDatabaseUrl({}), null);
  });

  test('ignores the HTTPS project URL the Supabase integration injects', () => {
    assert.equal(
      resolveDatabaseUrl({ SUPABASE_DATABASE_URL: 'https://abcdefgh.supabase.co' }),
      null,
    );
  });

  test('rejects a DATABASE_URL that is not a postgres:// string', () => {
    assert.throws(
      () => resolveDatabaseUrl({ DATABASE_URL: 'https://abcdefgh.supabase.co' }),
      /postgres:\/\//,
    );
  });
});
