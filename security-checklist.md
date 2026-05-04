# ShieldLend Solana Security Checklist

Risk level: Critical.

This checklist covers the first implementation scaffold. The programs are intentionally fail-closed wherever a real verifier or external protocol adapter is not wired yet.

## Applied Rules

- Anchor account constraints use PDA seeds and stored bumps for singleton and loan/nullifier accounts.
- Financial arithmetic uses checked math for counters, accrual, and repayment comparison paths.
- Proof-gated instructions do not accept caller-supplied "verified" booleans. They return verifier-not-wired errors until `groth16-solana`, MagicBlock, and Encrypt adapters are integrated.
- Fixed denominations are enforced in `shielded_pool::deposit` and `shielded_pool::withdraw`.
- Root validation checks the current root and retained 30-root history before withdrawal proof processing.
- Nullifier states are explicit: `Active`, `Locked`, `Spent`.
- Loan states are explicit: `Active`, `Repaid`, `Liquidated`.
- Liquidation uses the planned three-step async pattern: request reveal, verify reveal, liquidate.
- Liquidation requires FutureSign authorization, confirmed encrypted reveal, and at least two breach confirmations.
- External rails are adapter boundaries, not mocked production success paths.

## High-Risk Decisions

- Program IDs in `Anchor.toml` and `declare_id!` are placeholders until Solana tooling is installed and deployment keypairs are generated.
- `shielded_pool` currently queues exits but does not fan out SOL because the PER adapter must own that path.
- `lending_pool::borrow`, `repay`, and `verify_liquidation_reveal` fail closed until real verifier calls are integrated.
- `nullifier_registry` authorizes writer signer keys. For CPI, each writer program should use a registered PDA signer derived by that program, not a human wallet.
- Upgrade authority must be transferred to a multisig or timelock before any public deployment.

## Required Before Demo

- Replace placeholder program IDs.
- Wire `groth16-solana` verification against generated verification keys.
- Recompile all Circom circuits and regenerate `.wasm`, `.zkey`, and verification key artifacts.
- Wire MagicBlock PER, VRF, and Private Payments through official SDK/program interfaces.
- Wire IKA dWallet/FutureSign and Encrypt FHE verification once official interfaces are available in the repo.
- Add integration tests that prove spoofed proof/receipt flags cannot pass.
- Run a Solana vulnerability scan focused on arbitrary CPI, PDA validation, signer checks, ownership checks, and sysvar usage.
