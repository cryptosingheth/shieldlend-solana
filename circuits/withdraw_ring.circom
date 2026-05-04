pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/comparators.circom";
include "./constants.circom";

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hashers[levels];
    component mux[levels];
    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        hashers[i] = Poseidon(2);
        mux[i] = MultiMux1(2);

        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHashes[i];
        mux[i].s <== pathIndices[i];

        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];
        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[levels];
}

template WithdrawRing(levels, ringSize, shieldedPoolProgramId) {
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input denomination;
    signal input leaf_index;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input ring_index;

    // Public inputs
    signal input ring[ringSize];
    signal input nullifierHash;
    signal input root;

    // Public output
    signal output denomination_out;

    // ringSize is 16, so the comparison uses 5 bits. LessThan(4) puts the
    // upper bound exactly at 2^4 and relies on a boundary edge case.
    component ringIndexRange = LessThan(5);
    ringIndexRange.in[0] <== ring_index;
    ringIndexRange.in[1] <== ringSize;
    ringIndexRange.out === 1;

    component commitHasher = Poseidon(3);
    commitHasher.inputs[0] <== secret;
    commitHasher.inputs[1] <== nullifier;
    commitHasher.inputs[2] <== denomination;
    signal commitment;
    commitment <== commitHasher.out;

    denomination_out <== denomination;

    // Position-dependent and app-siloed nullifier:
    // Poseidon(nullifier, leaf_index, SHIELDED_POOL_PROGRAM_ID)
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.inputs[1] <== leaf_index;
    nullifierHasher.inputs[2] <== shieldedPoolProgramId;
    nullifierHash === nullifierHasher.out;

    component isEq[ringSize];
    signal selectedTerms[ringSize];
    signal runningSum[ringSize + 1];
    runningSum[0] <== 0;

    for (var i = 0; i < ringSize; i++) {
        isEq[i] = IsEqual();
        isEq[i].in[0] <== ring_index;
        isEq[i].in[1] <== i;
        selectedTerms[i] <== ring[i] * isEq[i].out;
        runningSum[i + 1] <== runningSum[i] + selectedTerms[i];
    }

    runningSum[ringSize] === commitment;

    // Public ring entries must be unique; repeated public commitments shrink
    // the effective anonymity set even when the selected commitment is valid.
    component ringUniqueChecks[ringSize * (ringSize - 1) / 2];
    var pair = 0;
    for (var a = 0; a < ringSize; a++) {
        for (var b = a + 1; b < ringSize; b++) {
            ringUniqueChecks[pair] = IsEqual();
            ringUniqueChecks[pair].in[0] <== ring[a];
            ringUniqueChecks[pair].in[1] <== ring[b];
            ringUniqueChecks[pair].out === 0;
            pair++;
        }
    }

    component treeChecker = MerkleTreeChecker(levels);
    treeChecker.leaf <== commitment;
    treeChecker.root <== root;
    for (var j = 0; j < levels; j++) {
        treeChecker.pathElements[j] <== pathElements[j];
        treeChecker.pathIndices[j] <== pathIndices[j];
    }
}

// Public signals:
// [0] denomination_out
// [1..16] ring
// [17] nullifierHash
// [18] root
// Third template arg is the ShieldLend Solana shielded_pool domain separator
// generated from circuits/constants.json by scripts/derive-program-id-field.mjs.
component main {public [ring, nullifierHash, root]} = WithdrawRing(24, 16, ShieldedPoolProgramIdField());
