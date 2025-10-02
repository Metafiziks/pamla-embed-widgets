// lib/viem.ts
import { createPublicClient, createWalletClient, http } from "viem";
import { abstractSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.testnet.abs.xyz";
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""; // optional, only if you want writes server-side

export const publicClient = createPublicClient({
  chain: abstractSepolia,
  transport: http(RPC_URL),
});

export const walletClient = PRIVATE_KEY
  ? createWalletClient({
      chain: abstractSepolia,
      transport: http(RPC_URL),
      account: privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, "")}`),
    })
  : undefined;
