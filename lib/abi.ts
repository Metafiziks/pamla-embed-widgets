export const BondingCurveABI = [
  { "type":"function","name":"buyExactEth","stateMutability":"payable","inputs":[{"name":"minTokensOut","type":"uint256"}],"outputs":[] },
  { "type":"function","name":"sellTokens","stateMutability":"nonpayable","inputs":[{"name":"amountIn","type":"uint256"},{"name":"minEthOut","type":"uint256"}],"outputs":[] },
  { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"owner","type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"event","name":"Trade","inputs":[
      {"name":"user","type":"address","indexed":true},
      {"name":"isBuy","type":"bool","indexed":false},
      {"name":"ethAmount","type":"uint256","indexed":false},
      {"name":"tokenAmount","type":"uint256","indexed":false},
      {"name":"priceAfter","type":"uint256","indexed":false},
      {"name":"timestamp","type":"uint256","indexed":false}
    ]}
] as const;

export const AccessControllerABI = [
  { "type":"function","name":"setPhase","stateMutability":"nonpayable","inputs":[{"name":"p","type":"uint8"}],"outputs":[] },
  { "type":"function","name":"setAllowlistBatch","stateMutability":"nonpayable","inputs":[{"name":"users","type":"address[]"},{"name":"allowed","type":"bool"}],"outputs":[] },
  { "type":"function","name":"allowlisted","stateMutability":"view","inputs":[{"name":"user","type":"address"}],"outputs":[{"type":"bool"}] }
] as const;
