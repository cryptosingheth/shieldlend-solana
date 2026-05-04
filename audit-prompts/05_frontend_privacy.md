Read audit-reports/00_AUDIT_BRIEF.md.

You are the Frontend Privacy Review Agent.

Goal:
Review whether the frontend correctly supports the intended privacy architecture and can demonstrate privacy flows safely.

Do not modify product code.
You may create audit-reports/05_FRONTEND_PRIVACY_REVIEW.md.

Review:
- frontend/src/
- frontend/src/lib/
- proof generation files
- wallet integration
- note storage
- API/client calls
- public signal formatting
- frontend tests if present

Check:

1. Proof generation:
   - how witnesses are built
   - how WASM/zkey/vkey artifacts are loaded
   - whether artifacts are stale
   - whether public signals match circuit/program expectations
   - whether frontend can create cheating witnesses

2. Note lifecycle:
   - note creation
   - note encryption
   - note storage
   - note recovery
   - note deletion
   - note export/import
   - localStorage/sessionStorage/indexedDB risks

3. Wallet/key derivation:
   - wallet signature flow
   - deterministic key derivation risks
   - wallet-linkage leakage
   - replay/phishing risks
   - whether the same wallet action links deposits/withdrawals/borrows

4. Privacy leakage:
   - amount leakage
   - action leakage
   - timing leakage
   - recipient leakage
   - RPC/network leakage
   - browser storage leakage
   - analytics/logging leakage
   - console logging sensitive data

5. UI/demo correctness:
   - Does the frontend show privacy that backend enforces?
   - Or does it only simulate/mock privacy?
   - Can a user test deposit/withdraw/borrow/repay realistically?
   - Are failed proof/nullifier states visible?
   - Are privacy claims overpromised?

6. Frontend-backend consistency:
   - program IDs
   - public input order
   - nullifier formatting
   - root/ring construction
   - commitment format
   - transaction instruction format

Output:
A. Frontend component inventory
B. Proof generation findings
C. Note storage/privacy findings
D. Wallet linkage findings
E. UI/demo readiness findings
F. Frontend-backend mismatch findings
G. Frontend privacy test plan
H. GitHub issues ordered by severity

For every finding include:
- Finding
- Severity
- File/path
- Evidence
- Why it matters
- Status
- Recommended test or fix