import { describe, expect, it } from 'vitest';
import { rewritePath } from '../src/utils/rewrite-path.js';

describe('rewritePath', () => {
  it('returns pathname unchanged when no rewrite provided', () => {
    expect(rewritePath('/api/users')).toBe('/api/users');
  });

  it('replacePath overrides pathname entirely', () => {
    expect(rewritePath('/api/users', { replacePath: '/v2/users' })).toBe(
      '/v2/users',
    );
  });

  it('replacePath takes priority over stripPrefix and addPrefix', () => {
    expect(
      rewritePath('/api/users', {
        replacePath: '/static',
        stripPrefix: '/api',
        addPrefix: '/v2',
      }),
    ).toBe('/static');
  });

  it('stripPrefix removes matching prefix', () => {
    expect(rewritePath('/api/users', { stripPrefix: '/api' })).toBe('/users');
  });

  it('stripPrefix returns "/" when path equals prefix exactly', () => {
    expect(rewritePath('/api', { stripPrefix: '/api' })).toBe('/');
  });

  it('stripPrefix is a no-op when prefix does not match', () => {
    expect(rewritePath('/other/users', { stripPrefix: '/api' })).toBe(
      '/other/users',
    );
  });

  it('addPrefix prepends to path', () => {
    expect(rewritePath('/users', { addPrefix: '/v2' })).toBe('/v2/users');
  });

  it('stripPrefix then addPrefix compose in order', () => {
    expect(
      rewritePath('/api/users', { stripPrefix: '/api', addPrefix: '/v2' }),
    ).toBe('/v2/users');
  });
});
