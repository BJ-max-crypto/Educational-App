export class StripeRequestError extends Error {
  readonly code: string | null;
  readonly param: string | null;
  readonly status: number;

  constructor(message: string, options: { code?: string | null; param?: string | null; status?: number }) {
    super(message);
    this.name = "StripeRequestError";
    this.code = options.code ?? null;
    this.param = options.param ?? null;
    this.status = options.status ?? 0;
  }
}

/** Stripe's "No such customer" response. The id is not in the account this secret key uses. */
export function isMissingStripeCustomer(error: unknown) {
  return error instanceof StripeRequestError && error.code === "resource_missing" && /no such customer/i.test(error.message);
}
