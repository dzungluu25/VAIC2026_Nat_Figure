# VAIC Credit Growth OS — AI Core v2

## Product thesis

The product is not a loan chatbot. It is a decision-and-execution workspace that helps a bank:

1. approve clean applications faster and at lower cost;
2. recover viable deals through safe restructuring instead of blunt rejection;
3. price offers above a risk-adjusted profitability floor;
4. reduce compliance leakage and incorrect downstream writes;
5. give every bank persona only the evidence and actions needed for their job.

North-star metric: **risk-adjusted profit per completed application**.

Supporting metrics: approval conversion, straight-through-processing rate, turnaround time, cost per application, exception rate, override rate, early delinquency and compliance incidents.

## Operating lanes

| Lane | Eligibility | AI depth | Human gate | Target SLA |
|---|---|---|---|---|
| Auto approval | Every deterministic auto-policy check passes | Rules + one explanation call | Policy-issued auto authority | < 30 seconds |
| Hybrid approval | Any complex product, exception or policy edge | Specialist agents + grounded tools | Credit approver required | < 3 minutes analysis |
| Manual escalation | Missing evidence, failed mandatory agent, low confidence or unprofitable offer | No further autonomous action | Specialist queue | Immediate routing |

Fast lane means fewer expensive reasoning steps, never fewer mandatory controls.

## User roles and agent ownership

| User persona | Primary objective | Agents exposed | Key action |
|---|---|---|---|
| Relationship Manager | Convert a customer need into an eligible, profitable offer | Profile, Product & Pricing | Build/pre-qualify deal |
| Credit Officer | Complete more applications with consistent analysis | Planner, Profile, Credit | Analyse and repair data |
| Credit Approver | Decide exceptions with evidence and profitability | Credit, Legal, Decision Gate | Approve, return or reject |
| Risk & Compliance | Control policy, consent and exceptions | Legal, Governance, Decision Gate | Maintain rules and review breaches |
| Operations | Fulfil exactly the approved proposal | Operations | Execute and monitor |
| Product Owner | Improve portfolio conversion and economics | Product, Planner, Decision Gate | Tune product and pricing strategy |

Runtime contracts are declared in `agent-role-registry.ts`. Each contract defines allowed decisions, forbidden actions, required evidence, SLA and failure policy.

## Hard constraints

- Financial calculations are deterministic; an LLM never calculates DTI, LTV, EMI or profitability.
- Every mandatory agent failure is fail-closed and routes to human escalation.
- Auto approval requires every auto-policy gate; LLM text cannot override it.
- Hybrid approval requires a valid approver token before any HIGH write.
- Operations receives canonical approved terms, never the original request or terms recovered from prose.
- Consent is checked before any external credit/tax/social-insurance lookup.
- Legal output must be source-grounded and schema-validated before production deployment.
- PII must be masked before model calls and public traces.
- Every decision carries rule IDs, evidence provenance, policy version and timestamps.
- Profitability is a decision input, not a reason to silently approve a risky application.

## Deterministic profitability model

The demo projects annual interest revenue, funding cost, expected loss, operating cost, capital charge, risk-adjusted profit and RAROC. Assumptions are explicit and must be replaced by Finance/Risk-owned parameters in a pilot.

An otherwise eligible offer below the profitability floor is routed for repricing or human review rather than auto-approved.

## UX principles

- Landing page communicates value in under 20 seconds.
- Workspace starts with sample cases; no login interruption in public demo mode.
- Agent Flow is an observability screen, not the primary work screen.
- Role page explains who owns each decision and which agents they can use.
- Decision card shows approved terms, approval lane, conditions, RAROC and time saved together.
- Progressive disclosure hides raw tool logs until a reviewer needs them.
- Auto, Hybrid and Escalation states use distinct labels and actions.

## Pilot path

1. Run in shadow mode using historical synthetic/de-identified cases.
2. Calibrate auto-policy and profitability parameters with Risk and Finance.
3. Compare recommendations with actual reviewer outcomes and repayment performance.
4. Enable assisted approval for Hybrid lane only.
5. Enable Auto lane for one low-risk product after policy, fairness and model-risk sign-off.
