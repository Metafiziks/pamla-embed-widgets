// lib/abi.ts

// ---- AccessController ABI (only what's used) ----
export const AccessControllerABI = [
  // setPhase(uint8)
  {
    type: "function",
    name: "setPhase",
    stateMutability: "nonpayable",
    inputs: [{ name: "p", type: "uint8" }],
    outputs: [],
  },
  // setAllowlistBatch(address[] addrs, bool allow)
  {
    type: "function",
    name: "setAllowlistBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "addrs", type: "address[]" },
      { name: "allow", type: "bool" },
    ],
    outputs: [],
  },
  // Optional helpers (not strictly required for your API)
  {
    type: "function",
    name: "phase",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isAllowed",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ---- BondingCurveToken ABI (only what's used by the widget) ----
export const BondingCurveABI = [
  // buyExactEth(uint256 minTokensOut) payable
  {
    type: "function",
    name: "buyExactEth",
    stateMutability: "payable",
    inputs: [{ name: "minTokensOut", type: "uint256" }],
    outputs: [],
  },
  // sellTokens(uint256 amountIn, uint256 minEthOut)
  {
    type: "function",
    name: "sellTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
    ],
    outputs: [],
  },
  // Admin setters that your deploy script calls (not used client-side but handy)
  {
    type: "function",
    name: "setTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "t", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setFeeBps",
    stateMutability: "nonpayable",
    inputs: [{ name: "bps", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setPaused",
    stateMutability: "nonpayable",
    inputs: [{ name: "p", type: "bool" }],
    outputs: [],
  },
] as const;
