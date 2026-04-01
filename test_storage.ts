import { storage } from './server/storage';

async function test() {
  try {
    console.log("Testing cash box...");
    const box = await storage.getCashBox();
    console.log("Box found:", box.totalAmount);

    console.log("Testing cash exchange validation...");
    const denom = {
          bills: { hundred: 0, fifty: 0, twenty: 0, ten: 0, five: 0, two: 0, one: 0 },
          coins: { five: 0, two: 0, one: 0, fifty_cents: 0, quarter: 0, dime: 0 }
        };
    try {
      await storage.createCashExchange({
        denominationsIn: denom,
        denominationsOut: denom,
        detail: "test"
      });
      console.log("Exchange recorded OK");
    } catch (e) {
      if (e instanceof Error) {
        console.error("Exchange error:", e.message);
      } else {
        console.error("Exchange error:", String(e));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR:", err);
    process.exit(1);
  }
}

test();
