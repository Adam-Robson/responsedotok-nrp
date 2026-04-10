import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { HeadersService } from '../src/lib/services/headers/headers-service.js';

function mockRes(): ServerResponse {
  return {
    removeHeader: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as ServerResponse;
}

describe('applyResponseHeaders', () => {
  it('removeds headers listed in globalRules.removeResponse', () => {
    const res = mockRes();
    const hs = new HeadersService({ removeResponse: ['x-powered-by'] }, false);
    hs.applyResponseHeaders(res, { removeResponse: ['x-powered-by'] });
    expect(res.removeHeader).toHaveBeenCalledWith('x-powered-by');
  });
});
