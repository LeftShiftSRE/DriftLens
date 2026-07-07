# Architecture overview

A tiny three-service repo. Each service owns one file and one responsibility.

## Services

- **user** — identity and lookup, in
  [`user-service.ts`](../src/user/user-service.ts). Clean; depends on nothing.
- **payments** — charging, in
  [`payment-service.ts`](../src/payments/payment-service.ts). See
  [ADR 0001](adr/0001-dedicated-payment-service.md).
- **checkout** — order completion, in
  [`checkout-service.ts`](../src/checkout/checkout-service.ts). Orchestrates the
  other two; see [ADR 0002](adr/0002-checkout-depends-on-payments.md).

## How the pieces fit

Checkout reads the user, then charges via payments. The decision to let checkout
call payments directly is recorded in ADR 0002 — which is also where the sample
repo's intentional drift lives (the dependency is accepted in the ADR but not
declared in `.driftlens.yml`).
