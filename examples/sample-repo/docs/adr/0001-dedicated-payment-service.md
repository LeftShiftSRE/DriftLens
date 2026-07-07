---
status: Accepted
date: 2026-07-06
components: [payments]
---

# ADR 0001: A dedicated payment service

- **Status:** Accepted
- **Date:** 2026-07-06

## Context

Charging a card touches PCI-sensitive data and a third-party gateway. Keeping
that logic inside the checkout flow would spread payment concerns across the
codebase and make the compliance boundary impossible to see.

## Decision

Payments live behind a single service —
[`payment-service.ts`](../../src/payments/payment-service.ts) — that owns the
`Charge` shape and the gateway call. Other services depend on its interface, not
on the gateway.

## Consequences

- **Positive:** One auditable boundary for payment data.
- **Neutral:** Callers must go through `PaymentService`; no direct gateway use.
