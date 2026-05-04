You are the Final ShieldLend Solana Audit Coordinator.

Read all reports under audit-reports/:
- 00_AUDIT_BRIEF.md
- 01_ARCHITECTURE_IMPLEMENTATION_REVIEW.md
- 02_ZK_CIRCUIT_REVIEW.md
- 03_SOLANA_ANCHOR_REVIEW.md
- 04_BACKEND_INTEGRATION_REVIEW.md
- 05_FRONTEND_PRIVACY_REVIEW.md
- 06_PRIVACY_THREAT_MODEL_REVIEW.md
- 07_TESTING_DEMO_READINESS_REVIEW.md

Create audit-reports/FINAL_AUDIT_REPORT.md.

Goal:
Merge all specialist findings into one clear, deduplicated, severity-ranked audit report.

Do not modify product code.

Output:

1. Executive decision:
   - Can frontend privacy testing start now?
   - If yes, under what limitations?
   - If no, what blocks it?

2. Current implementation status:
   Create a table:
   - component
   - implemented
   - partially implemented
   - mocked/stubbed
   - documented only
   - externally dependent
   - unsafe to claim yet
   - evidence

3. Architecture assessment:
   - Is the architecture coherent?
   - Are backend components correctly connected?
   - Are privacy assumptions explicit?
   - Are trust boundaries clear?
   - Is anything overclaimed?

4. Critical blockers:
   Deduplicate and rank all Critical/High issues.

5. Circuit findings:
   Summarize only the most important issues.

6. Solana Anchor findings:
   Summarize only the most important issues.

7. Backend integration findings:
   Summarize circuit/program/frontend wiring issues.

8. Frontend privacy findings:
   Summarize whether UI supports real privacy or only simulates it.

9. Privacy threat model gaps:
   Summarize which privacy claims are safe vs unsafe.

10. Testing plan:
   Provide exact order:
   - static review fixes
   - circuit tests
   - Anchor tests
   - backend integration tests
   - frontend proof-generation tests
   - frontend UI privacy tests
   - demo readiness tests

11. GitHub issue list:
   Ordered by severity:
   - title
   - severity
   - scope
   - description
   - acceptance criteria

12. Final recommendation:
   - What to fix before UI testing
   - What can be tested immediately
   - What should not be claimed publicly yet
   - What should be deferred

Important:
- Resolve contradictions between reports explicitly.
- If two agents disagree, cite both positions and choose the safer interpretation.
- Do not invent missing implementation.
- Use exact file/path evidence wherever possible.