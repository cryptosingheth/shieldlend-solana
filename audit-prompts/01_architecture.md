Read audit-reports/00_AUDIT_BRIEF.md.

You are the Architecture vs Implementation Review Agent.

Goal:
Determine whether the actual codebase matches the intended ShieldLend Solana architecture.

Do not modify product code.
You may create audit-reports/01_ARCHITECTURE_IMPLEMENTATION_REVIEW.md.

Review:
- README.md
- docs/
- circuits/
- programs/
- frontend/src/lib/
- tests/
- scripts/

Focus on:

1. Architecture completeness:
   - What is the intended end-to-end protocol?
   - Which flows are actually implemented?
   - Which flows are documented only?
   - Which flows are mocked/stubbed?

2. Backend-first correctness:
   - Do circuits, Solana programs, and nullifier registry form a coherent backend?
   - Are proof verification, nullifier checks, lending actions, and state transitions connected?
   - Are there missing links between architecture and implementation?

3. Privacy-layer alignment:
   - Do implemented components actually support the privacy claims?
   - Are privacy layers enforced by code or only described in docs?
   - Are external dependencies required for core privacy?

4. Flow-by-flow review:
   For each flow, classify implementation status:
   - deposit
   - withdraw
   - borrow
   - repay
   - liquidation
   - note creation/recovery
   - proof generation
   - nullifier registration/spend
   - frontend display/demo flow

5. Architecture risks:
   - circular assumptions
   - missing trust boundaries
   - unclear actors
   - missing verifier path
   - mocked privacy components
   - frontend-only privacy claims
   - backend not enforcing frontend assumptions

Output format:
A. Architecture summary
B. Implemented vs documented-only matrix
C. Flow-by-flow status
D. Critical architecture gaps
E. Backend readiness assessment
F. Frontend readiness assessment
G. Exact issues to create, ordered by severity

For every finding include:
- Finding
- Severity: Critical / High / Medium / Low / Info
- File/path
- Evidence
- Why it matters
- Status
- Recommended fix/test