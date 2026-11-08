import { checkJwtSecret } from './main';

describe('checkJwtSecret', () => {
  it('rejects a missing or short secret', () => {
    expect(checkJwtSecret({})).not.toBeNull();
    expect(checkJwtSecret({ JWT_SECRET: 'short' })).not.toBeNull();
  });
  it('accepts 32+ characters', () => {
    expect(checkJwtSecret({ JWT_SECRET: 'x'.repeat(32) })).toBeNull();
  });
});
