// lib/token.ts
export function must<T>(val: T | undefined, name: string): T {
  if (val === undefined || val === null || val === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

/**
 * Single source of truth for the widget’s token address.
 * Priority:
 * 1) Explicit prop / URL param (you may pass it into the component)
 * 2) NEXT_PUBLIC_TOKEN
 * 3) NEXT_PUBLIC_DEFAULT_CURVE
 */
export const ENV_TOKEN = (process.env.NEXT_PUBLIC_TOKEN ||
  process.env.NEXT_PUBLIC_DEFAULT_CURVE) as `0x${string}`;

export function resolveTokenAddress(fromProp?: `0x${string}` | string | null) {
  if (fromProp && fromProp.startsWith('0x') && fromProp.length === 42) {
    return fromProp as `0x${string}`;
  }
  return must(ENV_TOKEN, 'NEXT_PUBLIC_TOKEN or NEXT_PUBLIC_DEFAULT_CURVE') as `0x${string}`;
}
