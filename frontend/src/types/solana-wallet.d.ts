import type { SolanaWalletProvider } from "../lib/solanaClient";

declare global {
  interface Window {
    solana?: SolanaWalletProvider;
    phantom?: { solana?: SolanaWalletProvider };
  }
}

export {};
