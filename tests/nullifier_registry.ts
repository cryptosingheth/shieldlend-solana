import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("nullifier_registry", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it.skip("covers nullifier state transitions", async () => {
    assert.fail("Requires deployed NullifierRegistry IDL and program account");
  });

  it.skip("rejects unauthorized writer", async () => {
    assert.fail("Requires deployed NullifierRegistry IDL and program account");
  });

  it.skip("rejects invalid transitions", async () => {
    assert.fail("Requires deployed NullifierRegistry IDL and program account");
  });
});
