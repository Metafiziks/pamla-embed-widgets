// lib/wagmi.js

export const abstractSepolia = {
  id: 11124,
  name: 'Abstract Sepolia',
  network: 'abstract-sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
  blockExplorers: {
    default: { name: 'Abstract Scan', url: 'https://sepolia.abscan.org' },
  },
  testnet: true,
}
