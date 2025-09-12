// ---- AccessController (only what we use) ----
export const AccessControllerABI = [
  { type: "function", name: "setPhase", stateMutability: "nonpayable", inputs: [{ name: "p", type: "uint8" }], outputs: [] },
  { type: "function", name: "setAllowlistBatch", stateMutability: "nonpayable", inputs: [{ name: "addrs", type: "address[]" }, { name: "allow", type: "bool" }], outputs: [] },
] as const;

// ---- BondingCurve (only what the widget calls) ----
export const BondingCurveABI = [
  { type: "function", name: "buyExactEth", stateMutability: "payable", inputs: [{ name: "minTokensOut", type: "uint256" }], outputs: [] },
  { type: "function", name: "sellTokens", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" },{ name: "minEthOut", type: "uint256" }], outputs: [] },
] as const;
