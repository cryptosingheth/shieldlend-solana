# On-Chain Groth16 Verifier — Blockers Analysis

Date: 2026-05-05
Task: Convergence 2C — verify whether on-chain groth16-solana wiring can proceed safely.
Outcome: B — verifier wiring is blocked. No fake wiring performed.

---

## Result Summary

On-chain Groth16 verification **cannot be safely wired** in the current state.
The Anchor IDL generation blocker is **not** a prerequisite — `anchor build --no-idl`
compiles and would continue to compile after any of the changes below. But three
hard blockers prevent safe wiring independent of IDL generation.

---

## Confirmed State

| Item | Evidence |
|---|---|
| `groth16-solana` in any Cargo.toml | Not present |
| `groth16-solana` in Cargo.lock | Not present |
| `ark-bn254` in Cargo.lock | Present (transitive dep of `solana-program` 1.18.26) |
| Solana BN254 native syscalls available | Yes — `solana_program::alt_bn128::*` via solana-program 1.18.26 |
| Proof bytes in `WithdrawArgs` | No — only `root`, `nullifier_hash`, `denomination_lamports`, `stealth_address`, `relay_nonce` |
| Proof bytes in `BorrowArgs` | No — only a `collateral_proof_public_signals_hash: [u8; 32]` (hash only) |
| Proof bytes in `RepayArgs` | No — only a `repay_proof_public_signals_hash: [u8; 32]` (hash only) |
| Vkey conversion script for Solana BN254 encoding | Not present |
| Rust test vector using real proof bytes | Not present |
| Compute budget handled in any instruction | Not present |

---

## Fail-Closed Call Sites

| Program | File | Line | Function | Error |
|---|---|---|---|---|
| `shielded_pool` | `programs/shielded_pool/src/lib.rs` | 170 | `verify_withdraw_proof` | `PoolError::Groth16VerifierNotWired` |
| `lending_pool` | `programs/lending_pool/src/lib.rs` | 274 | `verify_collateral_proof` | `LendingError::Groth16VerifierNotWired` |
| `lending_pool` | `programs/lending_pool/src/lib.rs` | 278 | `verify_repay_proof` | `LendingError::Groth16VerifierNotWired` |

---

## Blocker 1 — `groth16-solana` dependency absent

**Type:** dependency/API mismatch

No verifier crate exists in any Cargo.toml or Cargo.lock.

The CLAUDE.md architecture references `groth16-solana` as the target verifier
(Mainnet-beta ready, BN254 native syscalls, <200k CU). This crate is not the same
as `ark-bn254`, which is present only as a transitive dependency of
`solana-program` 1.18.26. `ark-bn254` is a CPU-side library for host tests, not
a BPF syscall verifier.

Before adding the dependency, the following must be confirmed:

- Exact crate name and version on crates.io.
- Whether the crate API targets Anchor 0.30.1 / solana-program 1.18.x.
- Whether `anchor build --no-idl` still compiles after the dep is added (likely
  yes, but must be verified because BPF-incompatible host dependencies can cause
  build failures).

**This blocker alone does not prevent `anchor build --no-idl`.**
It becomes a build blocker only if the wrong version or a host-only crate is added.

---

## Blocker 2 — Instruction args do not carry proof bytes (hard ABI break)

**Type:** proof/public-signal encoding mismatch

This is the root structural blocker. On-chain Groth16 verification requires the
caller to pass the actual proof points and full public signal array as instruction
data. None of the three affected instruction arg structs include these.

### `WithdrawArgs` — `programs/shielded_pool/src/lib.rs:379`

Current fields: `root`, `nullifier_hash`, `denomination_lamports`, `stealth_address`, `relay_nonce`.

Missing required additions:
- `proof_a: [u8; 64]` — BN254 G1 point π_A (uncompressed affine, big-endian)
- `proof_b: [u8; 128]` — BN254 G2 point π_B (uncompressed affine, big-endian)
- `proof_c: [u8; 64]` — BN254 G1 point π_C (uncompressed affine, big-endian)
- 19 public signals matching `public_signals.json` withdraw order

  ```
  index 0  denomination_out
  index 1–16  ring[0..15]
  index 17  nullifierHash
  index 18  root
  ```

  All 19 signals must be passed as `[u8; 32]` big-endian field elements.

### `BorrowArgs` — `programs/lending_pool/src/lib.rs:451`

Current: `collateral_proof_public_signals_hash: [u8; 32]` (a hash, not the signals).

Missing: same `proof_a/b/c` fields plus 20 public signals for `collateral_ring`:

  ```
  index 0–15  ring[0..15]
  index 16  nullifierHash
  index 17  root
  index 18  borrowed
  index 19  minRatioBps
  ```

### `RepayArgs` — `programs/lending_pool/src/lib.rs:463`

Current: `repay_proof_public_signals_hash: [u8; 32]` (a hash, not the signals).

Missing: same `proof_a/b/c` fields plus 6 public signals for `repay_ring`:

  ```
  index 0  nullifierHash
  index 1  loanId
  index 2  outstandingBalance
  index 3  settlementReceiptHash
  index 4  repaymentVault
  index 5  receiptBindingHash
  ```

**Impact:** This is a breaking change to the Anchor program ABI and to the
frontend transaction builder. `frontend/src/lib/circuits.ts` generates snarkjs
proof objects (`proof: object, publicSignals: string[]`) but nothing serializes
them into the instruction byte layout that `WithdrawArgs`, `BorrowArgs`, or
`RepayArgs` will require after the change.

---

## Blocker 3 — vkey format conversion unscripted

**Type:** vkey format mismatch

The generated `_vkey.json` files are in snarkjs projective coordinate format:
- G1 points: `[x_decimal_string, y_decimal_string, "1"]`
- G2 points: `[[x_c1, x_c0], [y_c1, y_c0], ["1", "0"]]`

Solana BN254 syscalls (`alt_bn128_addition`, `alt_bn128_multiplication`,
`alt_bn128_pairing`) expect uncompressed affine big-endian byte encoding:
- G1: 64 bytes (32-byte x || 32-byte y)
- G2: 128 bytes (32-byte x_c0 || 32-byte x_c1 || 32-byte y_c0 || 32-byte y_c1)

The conversion must:
1. Parse decimal string coordinates from the snarkjs vkey JSON.
2. Reduce modulo the BN254 field prime to confirm canonical form.
3. Serialize each coordinate as a 32-byte big-endian byte array.
4. Concatenate in the correct field ordering for each curve.
5. Produce Rust byte-array constants or a runtime-loadable binary format
   suitable for embedding in the program or passing as an account.

No conversion script or utility exists in the repo. The vkeys are only used
client-side via snarkjs (which handles its own internal format).

The affected vkeys and their `IC` lengths are:

| Vkey file | nPublic | IC count | G2 points |
|---|---:|---:|---:|
| `withdraw_ring_vkey.json` | 19 | 20 | 3 (β, γ, δ) |
| `collateral_ring_vkey.json` | 20 | 21 | 3 |
| `repay_ring_vkey.json` | 6 | 7 | 3 |

---

## Blocker 4 — Missing on-chain test vectors

**Type:** missing verifier test vector

No Rust unit test contains real BN254 proof bytes matched against expected
verification outcomes. The smoke test artifacts (under `build/circuits/smoke/`)
are local JSON files produced by snarkjs and never serialized into the Rust test
format.

Without test vectors, the first validation of the wired verifier would be a live
devnet transaction, which is not possible before deployment.

**Minimum required before wiring:** at least one deterministic proof vector per
circuit in the form:

```rust
const WITHDRAW_PROOF_A: [u8; 64] = [...];
const WITHDRAW_PROOF_B: [u8; 128] = [...];
const WITHDRAW_PROOF_C: [u8; 64] = [...];
const WITHDRAW_PUBLIC_SIGNALS: [[u8; 32]; 19] = [...];
// Expected: verify returns Ok(())
```

---

## Blocker 5 — Compute budget not handled

**Type:** compute budget risk

BN254 Groth16 verification requires three pairing operations and several G1/G2
multiplications. For `withdraw_ring` (nPublic = 19) the compute estimate is:

- 4 pairing checks × ~40k CU each ≈ 160k–200k CU
- MSM over 19 IC points ≈ 19 × 3k CU ≈ 57k CU
- Total: approximately 220k–260k CU per instruction

Solana's default per-instruction compute limit is 200k CU. Without a prepended
`ComputeBudgetProgram::set_compute_unit_limit` instruction (typically 1.4M for
ZK operations), the withdraw instruction will fail on-chain regardless of whether
the verifier logic is correct.

Neither the program nor any frontend transaction builder currently handles this.

---

## IDL Blocker Status

**The Anchor IDL generation blocker is NOT a prerequisite for verifier wiring.**

`anchor build --no-idl` compiles the programs and produces `.so` files without
requiring the IDL proc-macro path. Adding the `groth16-solana` dependency,
extending arg structs, and running `anchor build --no-idl` will still work
even while the full IDL generation remains broken.

However, full IDL generation is required before the TypeScript client can use the
auto-generated instruction builders. If IDL is not fixed first, the frontend
transaction builder for withdraw/borrow/repay must be constructed manually or with
a stale IDL.

---

## Recommended Sequencing

Unblock in this order:

1. **Research and pin `groth16-solana` version.** Confirm crate name, version,
   API surface (`Proof`, `VerifyingKey`, `verify` signature), and BPF compatibility
   with Anchor 0.30.1. Do not add the dep until the API is confirmed.

2. **Write vkey conversion script.** Convert the three existing `_vkey.json` files
   to big-endian affine byte constants. Output Rust include files or separate JSON
   with hex-encoded byte arrays. Run this before touching any program code.

3. **Extend instruction arg structs** (`WithdrawArgs`, `BorrowArgs`, `RepayArgs`)
   to carry proof bytes and full public signals. Update the existing fail-closed
   tests to pass the new fields. This breaks the ABI; do it in one commit.

4. **Implement verifier calls** in `verify_withdraw_proof`, `verify_collateral_proof`,
   and `verify_repay_proof`. Replace the `err!(...)` stub with the real call.
   Gate on: (a) vkey loaded, (b) public signals match instruction args, (c)
   pairing check passes.

5. **Add Rust test vectors.** Derive deterministic test inputs from the smoke proof
   output. Add at least one passing and one failing (mutated) proof per circuit.

6. **Add compute budget.** Add a compute budget limit constant and document in
   the frontend that `set_compute_unit_limit` must be prepended for any instruction
   calling the verifier.

7. **Validate.** Run `cargo fmt`, `cargo test --workspace`, `npm run typecheck:frontend`,
   `npm run build:frontend`, `anchor build --no-idl`.
