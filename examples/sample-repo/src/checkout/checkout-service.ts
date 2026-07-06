import { UserService } from "../user/user-service";
// DRIFT: checkout imports payments, but `.driftlens.yml` does not declare
// payments as a dependency of checkout. The detector flags this as an
// undeclared-dependency error and drops the architecture health score.
import { PaymentService, type Charge } from "../payments/payment-service";

export class CheckoutService {
  constructor(
    private readonly users: UserService,
    private readonly payments: PaymentService,
  ) {}

  checkout(userId: string, charge: Charge): boolean {
    const user = this.users.getById(userId);
    if (!user) return false;
    return this.payments.charge(charge).ok;
  }
}
