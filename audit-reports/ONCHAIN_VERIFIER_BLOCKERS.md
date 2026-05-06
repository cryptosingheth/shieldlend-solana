# On-Chain Groth16 Verifier — Blockers Analysis

Date: 2026-05-05 (updated 2026-05-06 after C2E, C2F, C2G-A, C2G-B)
Task: Convergence 2C — verify whether on-chain groth16-solana wiring can proceed safely.
Outcome (C2C): B — verifier wiring was blocked. No fake wiring performed.
Update (C2E): Blockers B1–B5 resolved. New blocker B6 (tx MTU) discovered during ABI extension.
Update (C2F): B6 resolved via proof account PDA pattern. New non-fatal warning B7 (BPF stack frame) noted.
Update (C2G-A): B7 resolved. Box<Account> applied to four Anchor contexts; zero stack-frame errors.
Update (C2G-B): shielded_pool and nullifier_registry deployed to devnet. store_withdraw_proof smoke test confirmed on-chain (tx 66Bmcz54i18vB7GD6Mx44FRyJ86Ci7q7BdNxjBo6PRKG6gjuD2XEzdJVXpj1MG2c7zYDq9LeEzWJSLf7TERtHYSQ). lending_pool deployment blocked by insufficient devnet SOL.

---

## Result Summary (C2C, now superseded by C2E update below)

On-chain Groth16 verification **cannot be safely wired** in the current state.
The Anchor IDL generation blocker is **not** a prerequisite — `anchor build --no-idl`
compiles and would continue to compile after any of the changes below. But three
hard blockers prevent safe wiring independent of IDL generation.

## C2E Update (2026-05-06)

Blockers B1–B5 are resolved. The DEV/TEST verifier is wired. A new blocker (B6) was
discovered during ABI extension: the `WithdrawArgs` struct now totals ~976 bytes,
which combined with transaction overhead exceeds the 1232-byte Solana packet MTU.
See B6 below for details and resolution options.

## C2F Update (2026-05-06)

B6 resolved. Proof account PDA pattern implemented. All three instruction arg structs slimmed;
two new `store_*_proof` instructions added per program. All six instruction transactions now
fit within the 1232-byte MTU. See B6 → Resolved section below.

A new non-fatal BPF linker warning (B7) appeared during `anchor build --no-idl`; see B7 below.

---

## Confirmed State (C2C snapshot — see C2E Update for current state)

| Item | C2C Evidence | C2E Status |
|---|---|---|
| `groth16-solana` in any Cargo.toml | Not present | **Resolved** — `0.0.3` in both |
| `groth16-solana` in Cargo.lock | Not present | **Resolved** |
| `ark-bn254` in Cargo.lock | Present (transitive) | Unchanged |
| Solana BN254 native syscalls available | Yes | Unchanged |
| Proof bytes in `WithdrawArgs` | No | **Resolved** — `proof_a/b/c` + `[[u8;32];19]` |
| Proof bytes in `BorrowArgs` | No | **Resolved** — `proof_a/b/c` + `[[u8;32];20]` |
| Proof bytes in `RepayArgs` | No | **Resolved** — `proof_a/b/c` + `[[u8;32];6]` |
| Vkey conversion script | Not present | **Resolved** — `scripts/convert-vkeys.mjs` |
| Rust test vector using real proof bytes | Not present | **Resolved** — 14 new tests |
| Compute budget handled in client | Not present | **Resolved** — `buildComputeBudgetInstruction()` |

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

---

## Blocker 6 — Withdraw instruction exceeds 1232-byte Solana transaction MTU (C2E → Resolved C2F)

**Type:** transaction size / ABI

**Status: RESOLVED (C2F).** Proof account PDA pattern implemented. All transactions within MTU.

### Original problem (C2E)

`WithdrawArgs` with inline proof fields: ~976 bytes args + ~412 bytes overhead ≈ ~1388 bytes > 1232-byte MTU.

### Resolution implemented (C2F)

Proof bytes moved to a PDA account written in a prior transaction. Args carry only a 32-byte nonce.

**Post-C2F transaction size table:**

| Instruction | Args (bytes) | Est. tx size | Status |
|---|---|---|---|
| `store_withdraw_proof` | 904 (disc+nonce+proof+19 inputs) | ~1109 bytes | ✓ within MTU |
| `store_collateral_proof` | 936 (disc+nonce+proof+20 inputs) | ~1141 bytes | ✓ within MTU |
| `store_repay_proof` | 488 (disc+nonce+proof+6 inputs) | ~693 bytes | ✓ within MTU |
| `withdraw` | 144 (root+nullifier+denom+stealth+nonce+proof_nonce) | ~524 bytes | ✓ within MTU |
| `borrow` | 124 (fields+proof_nonce) | ~536 bytes | ✓ within MTU |
| `repay` | 144 (fields+proof_nonce) | ~556 bytes | ✓ within MTU |

**PDA design:**
- Seed: `[b"proof-data", authority, proof_nonce]`
- `consumed: bool` flag — set to `true` after handler reads; prevents replay
- `circuit_kind` discriminant — prevents cross-circuit proof substitution
- `authority` binding — prevents cross-user proof theft

**Two-transaction flow:**
1. `store_*_proof` — creates proof PDA, writes `proof_a/b/c + public_inputs`
2. `withdraw`/`borrow`/`repay` — reads from PDA, verifies proof, sets `consumed = true`

### Files changed (C2F)

- `programs/shielded_pool/src/lib.rs` — `ProofData` account (SPACE=908), `StoreWithdrawProof` context, `store_withdraw_proof`, slimmed `WithdrawArgs` (144 bytes), updated `verify_withdraw_proof(args, proof)`, 3 new `PoolError` variants
- `programs/lending_pool/src/lib.rs` — `ProofData` account (SPACE=940, +`public_input_count: u8`), `StoreLendingProof` context, `store_collateral_proof`, `store_repay_proof`, slimmed `BorrowArgs` (124 bytes) and `RepayArgs` (144 bytes), updated verify functions, 3 new `LendingError` variants
- `frontend/src/lib/solanaClient.ts` — `WITHDRAW_PROOF_DATA_SPACE`, `LENDING_PROOF_DATA_SPACE`, `generateProofNonce()`, `getWithdrawProofDataPda()`, `getLendingProofDataPda()`, `buildStoreWithdrawProofInstruction()`, `buildStoreCollateralProofInstruction()`, `buildStoreRepayProofInstruction()`

---

## Blocker 7 — BPF stack frame warnings (C2F → RESOLVED C2G-A)

**Type:** BPF linker / runtime risk

**Status: RESOLVED (C2G-A).** All stack-frame "Error:" diagnostics eliminated. `anchor build --no-idl` emits zero stack/frame/error messages.

### Original diagnostics (C2F)

After C2F introduced `ProofData` accounts in all three instruction contexts, `anchor build --no-idl` emitted:

**lending_pool:**
- `Borrow::try_accounts`: frame 6016 bytes (exceeds 4096-byte BPF limit by 1920 bytes)
- `Repay::try_accounts`: frame 5248 bytes (exceeds 4096-byte BPF limit by 1152 bytes)

**shielded_pool (pre-existing, first surfaced in C2G-A analysis):**
- `Withdraw::try_accounts`: frame 6464 bytes (exceeds 4096-byte BPF limit by 1336 bytes)
- `__private::__global::withdraw` entry point: frame 4544 bytes (exceeds limit by 304 bytes)

### Resolution implemented (C2G-A)

`Box<Account<'info, T>>` applied to all affected large accounts:

| Program | Context | Account boxed | Type | In-memory size |
|---|---|---|---|---|
| `lending_pool` | `Borrow` | `proof_data` | `ProofData` | 940 bytes |
| `lending_pool` | `Repay` | `proof_data` | `ProofData` | 940 bytes |
| `shielded_pool` | `Withdraw` | `proof_data` | `ProofData` | 908 bytes |
| `shielded_pool` | `Withdraw` | `state` | `ShieldedPoolState` | ~1100 bytes (Vec contents on heap) |

`Box<Account<'info, T>>` heap-allocates the deserialized account struct, replacing an N-byte inline value on the stack frame with an 8-byte pointer. All Anchor constraints (`constraint =`, `bump =`, `has_one =`), field accesses, mutations, and account exit serialization work identically through Rust's `Deref`/`DerefMut` coercion chains.

`ShieldedPoolState` was boxed in the `Withdraw` context because its fixed-size `historical_roots: [[u8;32]; 30]` field (960 bytes) contributes to the frame even though its `Vec<QueuedDeposit>` and `Vec<QueuedExit>` contents are heap-allocated via the allocator.

### Validation (C2G-A)

- `cargo fmt --all -- --check` — passed
- `cargo test --workspace` — passed, **47 tests** (no regressions)
- `npm run typecheck:frontend` — passed
- `npm run build:frontend` — passed (pre-existing ffjavascript warning only)
- `anchor build --no-idl` — passed; zero stack/frame/error diagnostics; only pre-existing Anchor `cfg` warnings remain

---

## C2G-B — Devnet Deployment and Smoke Test (2026-05-06)

### Deployed Programs

| Program | Program ID | Deploy slot | SO size | Deploy cost |
|---|---|---|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | 460526750 | ~232 KB | ~1.619 SOL |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | 460526822 | ~313 KB | ~2.182 SOL |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | — | ~348 KB | ~2.48 SOL (blocked) |

### Smoke Test — store_withdraw_proof

- Instruction: `store_withdraw_proof` on `shielded_pool` (`9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`)
- Script: `scripts/devnet-smoke.mjs`
- Vectors: DEV/TEST smoke proof from `programs/shielded_pool/src/groth16_verifier.rs`
- Result: **CONFIRMED on devnet**
- Signature: `66Bmcz54i18vB7GD6Mx44FRyJ86Ci7q7BdNxjBo6PRKG6gjuD2XEzdJVXpj1MG2c7zYDq9LeEzWJSLf7TERtHYSQ`
- Wallet balance after: 1.18485432 SOL

### Additional Findings During C2G-B

**shielded_pool::initialize realloc blocker:**
`ShieldedPoolState::SPACE` was 14500 bytes. Solana's realloc limit in CPI is 10240 bytes. Anchor's `init` constraint uses realloc internally, so `initialize` failed with "Account data size realloc limited to 10240 in inner instructions". Resolution: `MAX_EPOCH_COMMITMENTS` and `MAX_EXIT_QUEUE` reduced 128→8, SPACE 14500→1900 bytes. shielded_pool rebuilt and upgraded on devnet.

**end-to-end smoke result (devnet-e2e.mjs):**
- `nullifier_registry::initialize` — confirmed (sig `2of4jzbt...`)
- `shielded_pool::initialize` — confirmed after upgrade (sig `QMVjEr1d...`)
- `shielded_pool::store_withdraw_proof` — confirmed (sig `5YRBBhwJ...`)
- `shielded_pool::withdraw` — failed with `UnknownRoot` (error 6007, `0x1777`) at `lib.rs:140`
  - EXPECTED: pool freshly initialized with all-zero roots; smoke proof's root signal[18] is not zero and not in history
  - All account layout, PDA derivation, and proof_data guards passed before the root check
  - Remaining gap: a real deposit → flush_epoch cycle is needed to populate the Merkle root before withdraw can succeed

### Wallet After C2G-B

Balance: 3.670413760 SOL
