import { describe, expect, it } from 'vitest';
import { isMatch } from '../src/utils/is-match.js';

describe('isMatch', () => {
  it('"/" is a universal catch-all', () => {
    expect(isMatch('/', '/')).toBe(true);
    expect(isMatch('/', '/anything')).toBe(true);
    expect(isMatch('/', '/deep/nested/path')).toBe(true);
  });

  it('exact string match', () => {
    expect(isMatch('/api', '/api')).toBe(true);
  });

  it('prefix match followed by "/"', () => {
    expect(isMatch('/api', '/api/')).toBe(true);
    expect(isMatch('/api', '/api/users')).toBe(true);
  });

  it('prefix match followed by "?"', () => {
    expect(isMatch('/api', '/api?foo=bar')).toBe(true);
  });

  it('does not match partial prefix without separator', () => {
    expect(isMatch('/api', '/apiv2')).toBe(false);
    expect(isMatch('/api', '/apiv2/users')).toBe(false);
  });

  it('does not match unrelated path', () => {
    expect(isMatch('/api', '/other')).toBe(false);
  });

  it('function match returning true', () => {
    expect(isMatch((p) => p.startsWith('/admin'), '/admin/dashboard')).toBe(
      true,
    );
  });

  it('function match returning false', () => {
    expect(isMatch((p) => p.startsWith('/admin'), '/user')).toBe(false);
  });
});
