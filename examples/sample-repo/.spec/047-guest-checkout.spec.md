---
status: in-progress
owner: marcus
components: [checkout]
---

# Spec 047: Guest checkout flow

Let shoppers complete an order without creating an account. The work lives in the
checkout service and touches the payment charge path.

## Scope

- Add a guest branch to [`checkout-service.ts`](../src/checkout/checkout-service.ts)
  that skips the account lookup.
- Reuse the existing [`payment-service.ts`](../src/payments/payment-service.ts)
  charge call unchanged.

## Status

In progress — owned by Marcus. This is the spec DriftLens links to the
`checkout` service via a `specified_by` edge: the frontmatter names `checkout`
and the body links to a file under `src/checkout/**`.
