pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template RepayRing(shieldedPoolProgramId) {
    // Private inputs
    signal input nullifier;
    signal input leaf_index;

    // Public inputs
    signal input nullifierHash;
    signal input loanId;
    signal input outstandingBalance;
    signal input settlementReceiptHash;
    signal input repaymentVault;
    signal input receiptBindingHash;

    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.inputs[1] <== leaf_index;
    nullifierHasher.inputs[2] <== shieldedPoolProgramId;
    nullifierHash === nullifierHasher.out;

    // Bind the private-payment receipt to the exact loan context checked by
    // lending_pool. MagicBlock verifies the receipt; this circuit proves the
    // caller knows the collateral nullifier used in the same receipt binding.
    component receiptBinder = Poseidon(5);
    receiptBinder.inputs[0] <== loanId;
    receiptBinder.inputs[1] <== nullifierHash;
    receiptBinder.inputs[2] <== outstandingBalance;
    receiptBinder.inputs[3] <== settlementReceiptHash;
    receiptBinder.inputs[4] <== repaymentVault;
    receiptBindingHash === receiptBinder.out;
}

// Public signals:
// [0] nullifierHash
// [1] loanId
// [2] outstandingBalance
// [3] settlementReceiptHash
// [4] repaymentVault
// [5] receiptBindingHash
// Template arg is the ShieldLend Solana shielded_pool domain separator.
// Regenerate this value when the deployed shielded_pool program id is finalized.
component main {public [
    nullifierHash,
    loanId,
    outstandingBalance,
    settlementReceiptHash,
    repaymentVault,
    receiptBindingHash
]} = RepayRing(13);
