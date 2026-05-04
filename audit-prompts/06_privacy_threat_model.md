Read audit-reports/00_AUDIT_BRIEF.md.

You are the Blockchain Privacy Threat Model Review Agent.

Goal:
Review whether ShieldLend’s claimed privacy properties are actually achieved by the current architecture and code.

Do not modify product code.
You may create audit-reports/06_PRIVACY_THREAT_MODEL_REVIEW.md.

Review:
- README.md
- docs/PRIVACY_AND_THREAT_MODEL.md
- docs/architecture.md
- docs/NOTE_LIFECYCLE.md
- docs/VISUAL_FLOWS.md
- circuits/
- programs/
- frontend/src/lib/ only where needed to verify claims

Threat model actors:
- external chain observer
- RPC provider
- frontend/browser observer
- relayer/operator
- malicious borrower
- malicious lender/liquidator
- admin/operator
- compromised local device
- MEV/searcher/timing observer

Check privacy claims:

1. Wallet unlinkability:
   - deposit wallet to withdraw wallet
   - wallet to borrow action
   - wallet to repay action
   - wallet to liquidation

2. Action unlinkability:
   - deposit ↔ withdraw
   - collateral ↔ borrow
   - borrow ↔ repay
   - repay ↔ user
   - liquidation ↔ borrower

3. Amount privacy:
   - deposit amount
   - collateral amount
   - borrow amount
   - repayment amount
   - liquidation amount
   - fixed denomination vs variable amount

4. Timing privacy:
   - batching
   - ring size
   - relay delay
   - frontend behavior
   - transaction timing

5. Recipient/destination privacy:
   - stealth addresses
   - Umbra assumptions
   - destination exposure on-chain
   - frontend formatting

6. External privacy dependencies:
   - MagicBlock PER/VRF/private payments
   - IKA dWallet relay
   - Encrypt FHE
   - Umbra
   - RPC privacy
   - relayer trust

7. Claim classification:
   For each privacy claim, classify:
   - implemented
   - partially implemented
   - mocked/stubbed
   - documented only
   - externally dependent
   - unsafe to claim yet

Output:
A. Privacy claim matrix
B. Threat actor matrix
C. What privacy is actually achieved today
D. What privacy is only documented
E. What privacy depends on external systems
F. Unsafe claims to remove from README/UI
G. Privacy regression test plan
H. GitHub issues ordered by severity

For every finding include:
- Finding
- Severity
- File/path
- Evidence
- Why it matters
- Status
- Recommended test or fix