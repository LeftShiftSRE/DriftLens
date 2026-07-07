---
status: Accepted
date: 2026-07-06
components: [checkout, payments]
---

# ADR 0002: Checkout may depend on payments

- **Status:** Accepted
- **Date:** 2026-07-06

## Context

Completing an order requires charging the customer. The checkout flow therefore
needs to call the payment service directly rather than routing the charge
through a third party.

## Decision

[`checkout-service.ts`](../../src/checkout/checkout-service.ts) is allowed to
depend on [`payment-service.ts`](../../src/payments/payment-service.ts). This is
a deliberate, accepted dependency.

> **Drift note for the demo:** this decision was accepted, but
> `.driftlens.yml` does *not* list `payments` under `checkout.dependencies`.
> The code follows the ADR; the declared architecture has drifted behind it.
> That is exactly the gap DriftLens surfaces — an accepted decision the config
> hasn't caught up to. Add `payments` to `checkout.dependencies` to reconcile.

## Consequences

- **Positive:** Checkout can complete orders without an intermediary.
- **Negative:** A checkout↔payments coupling that must stay declared in
  `.driftlens.yml` or it reads as undeclared drift.
