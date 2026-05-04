Read audit-reports/00_AUDIT_BRIEF.md.

You are the Testing and Demo Readiness Review Agent.

Goal:
Determine what tests exist, what is missing, and whether ShieldLend Solana is ready for frontend UI privacy testing.

Do not modify product code.
You may create audit-reports/07_TESTING_DEMO_READINESS_REVIEW.md.

Review:
- tests/
- frontend tests
- circuit test scripts
- Anchor tests
- package.json scripts
- Cargo test setup
- CI files
- docs mentioning test flow

Classify existing tests as:
- smoke tests
- unit tests
- integration tests
- circuit tests
- proof generation tests
- Anchor security tests
- frontend UI tests
- privacy regression tests
- end-to-end protocol tests

Check missing tests for:

1. Circuits:
   - valid witness proof
   - invalid witness rejection
   - wrong nullifier rejection
   - wrong Merkle path rejection
   - wrong root rejection
   - wrong ring index rejection
   - stale artifact detection
   - public signal ordering

2. Anchor programs:
   - invalid signer rejection
   - wrong PDA rejection
   - double-spend nullifier rejection
   - unauthorized registry write rejection
   - borrow limit enforcement
   - repay accounting
   - liquidation conditions
   - pause/emergency mode
   - verifier missing/fail-closed behavior

3. Backend integration:
   - deposit → commitment
   - withdraw → proof → nullifier spent
   - collateral → borrow
   - repay → debt update
   - invalid proof rejected
   - replay rejected

4. Frontend:
   - proof generation works
   - note storage works
   - encrypted note recovery works
   - wrong note fails
   - stale artifacts detected
   - public signal formatting matches backend
   - UI does not leak sensitive values in logs/storage

5. Privacy tests:
   - wallet unlinkability simulation
   - amount leakage check
   - timing leakage limitations
   - RPC/network leakage limitations
   - local storage leakage
   - claim-vs-implementation test cases

Output:
A. Existing test inventory
B. Test quality classification
C. Missing critical tests
D. Minimum tests before frontend UI testing
E. Minimum tests before public demo
F. Suggested test execution order
G. GitHub issues ordered by severity