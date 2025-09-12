// Centralized ABIs for widgets
export const BondingCurveABI = [
  { type: 'function', name: 'buyExactEth', stateMutability: 'payable', inputs: [{ name: 'minTokensOut', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'sellTokens', stateMutability: 'nonpayable', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'minEthOut', type: 'uint256' }], outputs: [] },
  { type: 'event', name: 'Transfer', inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ]},
]

export const AccessControllerABI = [
  { type: 'function', name: 'getPhase', stateMutability: 'view', inputs: [], outputs: [{ name: 'p', type: 'uint8' }] },
  { type: 'function', name: 'phase', stateMutability: 'view', inputs: [], outputs: [{ name: 'p', type: 'uint8' }] },
  { type: 'function', name: 'isAllowlisted', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 'yes', type: 'bool' }] },
  { type: 'function', name: 'setAllowlistBatch', stateMutability: 'nonpayable', inputs: [{ name: 'addrs', type: 'address[]' }, { name: 'allow', type: 'bool' }], outputs: [] },
]

export const PointsManagerABI = [
  { type: 'function', name: 'pointsOf', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 'points', type: 'uint256' }] },
  { type: 'function', name: 'points', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 'points', type: 'uint256' }] },
]

export const ERC721ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: 'balance', type: 'uint256' }] },
]
