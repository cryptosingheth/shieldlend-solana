import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("shielded_pool", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it.skip("accepts only fixed SOL denominations", async () => {
    assert.fail("Requires deployed ShieldedPool IDL and program account");
  });

  it.skip("updates root history on epoch flush", async () => {
    assert.fail("Requires deployed ShieldedPool IDL and program account");
  });

  it.skip("fails closed when withdrawal verifier is not wired", async () => {
    assert.fail("Requires deployed ShieldedPool IDL and program account");
  });
});
