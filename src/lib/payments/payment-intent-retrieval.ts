export type PaymentIntentRetriever<T> = {
  paymentIntents: {
    retrieve(id: string): Promise<T>;
  };
};

export async function retrievePaymentIntent<T>(
  stripe: PaymentIntentRetriever<T>,
  id: string,
): Promise<{ ok: true; intent: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, intent: await stripe.paymentIntents.retrieve(id) };
  } catch (error) {
    return { ok: false, error };
  }
}
