export function resolveZeroOneResolvedApiKey(env = process.env) {
  return String(
    env.NAVGATOR_API_KEY
    || env.ZERO_ONE_RESOLVED_API_KEY
    || env.ONE_RESOLVED_API_KEY
    || env.RESOLVED_01_API_KEY
    || '',
  ).trim();
}
