/** Minimal, isolated process settings for configuration tests. */
export function testEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...overrides }
}
