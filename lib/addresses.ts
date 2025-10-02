export const ADDRESSES = {
  CURVE: process.env.NEXT_PUBLIC_DEFAULT_CURVE as `0x${string}`,           // BondingCurveToken or router default
  ACL: process.env.NEXT_PUBLIC_DEFAULT_ACL as `0x${string}`,               // AccessController
  POINTS: process.env.NEXT_PUBLIC_POINTS_MANAGER as `0x${string}` | undefined,
  ACCESS_CONTROLLER: process.env.NEXT_PUBLIC_ACCESS_CONTROLLER as `0x${string}` | undefined,
  PAMS_NFT: process.env.NEXT_PUBLIC_PAMS_NFT as `0x${string}` | undefined,

  // Optional if you later align to these:
  REGISTRY: process.env.NEXT_PUBLIC_REGISTRY as `0x${string}` | undefined,
  FACTORY: process.env.NEXT_PUBLIC_FACTORY as `0x${string}` | undefined,
  TOKEN: process.env.NEXT_PUBLIC_TOKEN as `0x${string}` | undefined,
} as const;

// Fail fast in dev if required ones are missing:
export function assertRequiredAddresses() {
  const missing: string[] = [];
  if (!ADDRESSES.CURVE) missing.push('NEXT_PUBLIC_DEFAULT_CURVE');
  if (!ADDRESSES.ACL) missing.push('NEXT_PUBLIC_DEFAULT_ACL');
  if (!ADDRESSES.REGISTRY) missing.push('NEXT_PUBLIC_REGISTRY');
  if (!ADDRESSES.FACTORY) missing.push('NEXT_PUBLIC_FACTORY');
  if (missing.length) {
    throw new Error(`Missing required env(s): ${missing.join(', ')}`);
  }
}
