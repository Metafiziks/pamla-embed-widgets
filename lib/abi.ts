// lib/abi.ts

// --- Minimal ERC-721 (balanceOf only) ---
export const ERC721ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

// --- AccessController (reads used in UI) ---
export const AccessControllerABI = [
  {
    type: 'function',
    name: 'getPhase',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'p', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'phase',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'p', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'isAllowlisted',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
] as const;

// --- BondingCurve (functions used by the embed) ---
export const BondingCurveABI = [
  {
    type: 'function',
    name: 'buyExactEth',
    stateMutability: 'payable',
    inputs: [{ name: 'minTokensOut', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'sellTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'minEthOut', type: 'uint256' },
    ],
    outputs: [],
  },
  // For charts / balance indexing (standard ERC20 Transfer)
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
] as const;
