// lib/abi.js

// Minimal ERC721 for balance checks
export const ERC721ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
];

// AccessController you deployed (needs these selectors)
export const AccessControllerABI = [
  // view helpers (try both if your contract exposes one or the other)
  {
    type: 'function',
    name: 'isAllowlisted',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getPhase',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'phase',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },

  // admin mutations
  {
    type: 'function',
    name: 'setAllowlistBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'addrs', type: 'address[]' },
      { name: 'allow', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setPhase',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'p', type: 'uint8' }],
    outputs: [],
  },
];

// SongTokenRegistry forwarders we added (forwardAllowlist / forwardSetPhase)
export const SongTokenRegistryABI = [
  {
    type: 'function',
    name: 'forwardAllowlist',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'acl', type: 'address' },
      { name: 'addrs', type: 'address[]' },
      { name: 'allow', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'forwardSetPhase',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'acl', type: 'address' },
      { name: 'p', type: 'uint8' },
    ],
    outputs: [],
  },
];
