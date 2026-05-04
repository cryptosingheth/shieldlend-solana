Read audit-reports/00_AUDIT_BRIEF.md.

You are the Solana Anchor Program Security Review Agent.

Goal:
Review whether the Solana programs safely enforce ShieldLend’s backend state transitions.

Do not modify product code.
You may create audit-reports/03_SOLANA_ANCHOR_REVIEW.md.

Review:
- programs/
- Anchor.toml
- Cargo.toml files
- IDL files if present
- tests related to programs

Check:

1. Program inventory:
   - program names
   - instructions
   - accounts
   - state accounts
   - events
   - errors

2. Account constraints:
   - PDA seeds
   - bump usage
   - signer checks
   - has_one constraints
   - owner checks
   - mutability
   - init/realloc/close risks
   - rent/lamport handling

3. Authority model:
   - admin authority
   - user authority
   - registry authority
   - pool authority
   - verifier authority
   - emergency authority

4. Nullifier lifecycle:
   - Active → Locked → Spent
   - double-spend prevention
   - replay resistance
   - borrow/repay nullifier usage
   - registry writer authorization
   - race conditions

5. Lending invariants:
   - collateral deposit
   - borrow limits
   - LTV/health factor
   - repayment accounting
   - liquidation conditions
   - solvency enforcement
   - pool accounting
   - token/lamport custody

6. Proof verification integration:
   - Is Groth16 verification implemented on-chain?
   - Are proof public inputs checked correctly?
   - Does the program fail closed if verifier/artifacts are missing?
   - Can a user bypass proof verification?

7. CPI and custody risks:
   - CPI assumptions
   - token transfers
   - lamport movements
   - program-derived authority
   - unauthorized withdrawals

8. Degraded/emergency mode:
   - fail-open vs fail-closed behavior
   - admin override risks
   - paused state risks
   - partial privacy mode risks

Output:
A. Program inventory
B. Instruction-by-instruction review
C. Account/PDA findings
D. Authority model findings
E. Nullifier/lending invariant findings
F. Proof-verifier integration findings
G. Critical backend blockers
H. Anchor test plan
I. GitHub issues ordered by severity

For every finding include:
- Finding
- Severity
- File/path
- Evidence
- Why it matters
- Status
- Recommended test or fix