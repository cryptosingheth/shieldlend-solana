import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("lending_pool", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it.skip("fails closed when Groth16 verifier is not wired", async () => {
    assert.fail("Requires deployed LendingPool IDL and program account");
  });

  it.skip("rejects liquidation without FutureSign and confirmed breach", async () => {
    assert.fail("Requires deployed LendingPool IDL and program account");
  });

  it.skip("accrues outstanding balance without overflow", async () => {
    assert.fail("Requires deployed LendingPool IDL and program account");
  });
});
