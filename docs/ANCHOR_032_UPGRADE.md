# Anchor 0.32.1 Upgrade

Last updated: 2026-05-08

Branch: `upgrade/anchor-032-privacy-rails`

## Outcome

The workspace has been upgraded from Anchor `0.30.1` to Anchor `0.32.1` without changing program IDs and without wiring MagicBlock PER or Encrypt Anchor CPI code.

This upgrade removes the local Anchor version gap for future MagicBlock PER macro and Encrypt Anchor compatibility work. It does not make those rails live inside the Anchor programs.

## Dependency Changes

| Area | Previous | Current | Notes |
|---|---:|---:|---|
| Anchor CLI | `0.30.1` | `0.32.1` | Installed with `avm install 0.32.1`; `Anchor.toml` pins `anchor_version = "0.32.1"` |
| `anchor-lang` | `0.30.1` | `0.32.1` | Root workspace dependency updated |
| `@coral-xyz/anchor` | absent | `0.32.1` | Added at root for checked-in Anchor TS tests |
| `anchor-spl` | unused | unused | Not added; no program imports it |
| `groth16-solana` | `0.0.3` | `0.0.3` | Preserved to avoid changing the C2H Groth16 verifier path |

Anchor 0.32.1 depends on the split Solana 2.x crate family (`solana-account-info`, `solana-cpi`, `solana-pubkey`, etc.). `groth16-solana 0.0.3` still pulls `solana-program 1.18.26`. This mixed graph compiles and tests in this workspace because the Groth16 helper interface is isolated behind byte-array verifier calls.

References:

- Anchor release notes for 0.32.1: update `anchor-cli`, Anchor crates, and TS packages to `0.32.1`; recommended Solana tooling is `2.3.0`.
- docs.rs metadata for `anchor-lang 0.32.1`: confirms the split Solana 2.x crate dependencies.

## Program IDs

No program IDs changed.

| Program | Program ID |
|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` |

No redeploy was performed in this task.

## Validation

| Command | Status | Notes |
|---|---|---|
| `anchor --version` | PASS | `anchor-cli 0.32.1` |
| `cargo fmt --all -- --check` | PASS | No formatting changes required |
| `cargo test --workspace` | PASS | 47 tests pass, including Groth16 verifier smoke and mutated-proof rejection tests |
| `anchor build --no-idl` | PASS | Builds all three programs with Anchor CLI 0.32.1 |
| `npm run typecheck:frontend` | PASS | TypeScript check passes |
| `npm run build:frontend` | PASS | Next.js build passes with existing `web-worker` dynamic import warning through `circomlibjs` |
| `npm run demo:status` | PASS | Warns that the current branch differs from the hackathon convergence branch; all checks exit 0 |

## Warnings To Track

`cargo test --workspace` and `anchor build --no-idl` emit Anchor/Solana macro `unexpected_cfgs` warnings such as `anchor-debug`, `custom-heap`, `custom-panic`, and `no-log-ix-name`. These warnings do not fail the build.

`anchor build --no-idl` also emits SBF post-processing warnings that several symbols are undefined or not known syscalls, including standard Solana syscalls and `sol_alt_bn128_group_op`. This was not promoted to a failure by the build command, but it should be treated as a deployment/runtime validation item before redeploying upgraded binaries.

## C2H Groth16 Preservation

The C2H withdraw proof code path was preserved:

- `groth16-solana = "0.0.3"` remains pinned in `shielded_pool` and `lending_pool`.
- `verify_withdraw_groth16()` and proof PDA logic were not changed.
- Rust unit tests still verify the valid withdraw smoke vector and reject mutated/empty/mismatched proofs.

The previously confirmed devnet C2H round-trip remains prior deployment evidence. It was not rerun in this task because no redeploy was requested and the full devnet round-trip script is destructive.

## Current Privacy Rail Boundary

Anchor 0.32.1 compatibility is now present at the workspace/toolchain level.

Still not live:

- MagicBlock PER Rust macros in `shielded_pool` or `lending_pool`.
- MagicBlock Private Payments.
- Encrypt Anchor CPI or on-chain FHE health computation.
- IKA Solana relay signing.
- Umbra native SOL ShieldLend payout.

Next implementation work should wire one rail at a time and re-run C2H after any program-side change.
