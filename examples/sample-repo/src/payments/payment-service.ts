export interface Charge {
  amount: number;
  currency: string;
}

export class PaymentService {
  charge(charge: Charge): { ok: boolean } {
    return { ok: charge.amount > 0 };
  }
}
