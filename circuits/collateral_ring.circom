pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/comparators.circom";

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

template CollateralRing(levels, ringSize, shieldedPoolProgramId) {
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
    signal input borrowed;
    signal input minRatioBps;

    component ringIndexRange = LessThan(4);
    ringIndexRange.in[0] <== ring_index;
    ringIndexRange.in[1] <== ringSize;
    ringIndexRange.out === 1;

    component commitHasher = Poseidon(3);
    commitHasher.inputs[0] <== secret;
    commitHasher.inputs[1] <== nullifier;
    commitHasher.inputs[2] <== denomination;
    signal commitment;
    commitment <== commitHasher.out;

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

    component treeChecker = MerkleTreeChecker(levels);
    treeChecker.leaf <== commitment;
    treeChecker.root <== root;
    for (var j = 0; j < levels; j++) {
        treeChecker.pathElements[j] <== pathElements[j];
        treeChecker.pathIndices[j] <== pathIndices[j];
    }

    signal lhs;
    signal rhs;
    lhs <== denomination * minRatioBps;
    rhs <== borrowed * 10000;

    component ltvCheck = GreaterEqThan(96);
    ltvCheck.in[0] <== lhs;
    ltvCheck.in[1] <== rhs;
    ltvCheck.out === 1;
}

// Public signals:
// [0..15] ring
// [16] nullifierHash
// [17] root
// [18] borrowed
// [19] minRatioBps
// Third template arg is the ShieldLend Solana shielded_pool domain separator.
// Regenerate this value when the deployed shielded_pool program id is finalized.
component main {public [ring, nullifierHash, root, borrowed, minRatioBps]} = CollateralRing(24, 16, 13);
