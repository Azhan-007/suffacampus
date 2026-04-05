import Razorpay from "razorpay";

function getRazorpay(): Razorpay {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error(
      "Missing Razorpay environment variables: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET"
    );
  }

  return new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
}

// Lazy proxy — only initialised when first accessed
export const razorpay: Razorpay = new Proxy({} as Razorpay, {
  get: (_target, prop) => (getRazorpay() as any)[prop as string],
});
