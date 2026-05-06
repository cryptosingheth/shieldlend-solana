// ============================================================
// Program: ShieldedPool
// Framework: Anchor
// Testing:   TypeScript/Anchor
// Risk Level: Critical
// Security: See security-checklist.md
// ============================================================

pub mod groth16_verifier;

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use nullifier_registry::{
    self, cpi::accounts as registry_accounts, program::NullifierRegistry, RegistryConfig,
};

declare_id!("9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE");

pub const ROOT_HISTORY_SIZE: usize = 30;
pub const MAX_EPOCH_COMMITMENTS: usize = 128;
pub const MAX_EXIT_QUEUE: usize = 128;
pub const REGISTRY_WRITER_SEED: &[u8] = b"registry-writer";
pub const LENDING_POOL_AUTHORITY_SEED: &[u8] = b"lending-pool-authority";
pub const PROOF_DATA_SEED: &[u8] = b"proof-data";
pub const LENDING_POOL_PROGRAM_ID: Pubkey =
    anchor_lang::pubkey!("HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7");

#[program]
pub mod shielded_pool {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.current_root = [0; 32];
        state.historical_roots = [[0; 32]; ROOT_HISTORY_SIZE];
        state.root_index = 0;
        state.next_index = 0;
        state.epoch_start_slot = Clock::get()?.slot;
        state.epochs_without_per_flush = 0;
        state.protocol_mode = ProtocolMode::FullPrivacy;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        commitment: [u8; 32],
        denomination_lamports: u64,
        relay_nonce: u64,
    ) -> Result<()> {
        require_valid_denomination(denomination_lamports)?;
        require!(
            ctx.accounts.state.epoch_commitments.len() < MAX_EPOCH_COMMITMENTS,
            PoolError::EpochQueueFull
        );

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.relay.to_account_info(),
                    to: ctx.accounts.state.to_account_info(),
                },
            ),
            denomination_lamports,
        )?;

        let queued = QueuedDeposit {
            commitment,
            denomination_lamports,
            relay_nonce,
            inserted_at_slot: Clock::get()?.slot,
        };
        ctx.accounts.state.epoch_commitments.push(queued);
        Ok(())
    }

    pub fn flush_epoch(
        ctx: Context<FlushEpoch>,
        new_root: [u8; 32],
        inserted_count: u16,
        vrf_randomness_hash: [u8; 32],
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            usize::from(inserted_count) == state.epoch_commitments.len(),
            PoolError::InsertedCountMismatch
        );
        require!(vrf_randomness_hash != [0; 32], PoolError::MissingVrf);

        let root_index = state.root_index as usize;
        state.current_root = new_root;
        state.historical_roots[root_index] = new_root;
        state.root_index = (state.root_index + 1) % ROOT_HISTORY_SIZE as u8;
        state.next_index = state
            .next_index
            .checked_add(u64::from(inserted_count))
            .ok_or(PoolError::ArithmeticOverflow)?;
        state.epoch_commitments.clear();
        state.epoch_start_slot = Clock::get()?.slot;
        state.epochs_without_per_flush = 0;
        Ok(())
    }

    /// Write a Groth16 withdraw proof to a PDA before calling withdraw.
    ///
    /// Two-transaction flow (B6 MTU fix):
    ///   1. store_withdraw_proof — writes proof_a/b/c + public_inputs to a proof PDA.
    ///   2. withdraw             — reads proof from the PDA; marks it consumed.
    ///
    /// The proof_nonce seeds the PDA and must be passed again to withdraw as
    /// WithdrawArgs.proof_nonce. Generate a fresh random nonce per use.
    ///
    /// Transaction size: ~1109 bytes (within 1232-byte Solana MTU).
    pub fn store_withdraw_proof(
        ctx: Context<StoreWithdrawProof>,
        proof_nonce: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 19],
    ) -> Result<()> {
        let p = &mut ctx.accounts.proof_data;
        p.authority = ctx.accounts.authority.key();
        p.circuit_kind = ProofKind::Withdraw;
        p.proof_a = proof_a;
        p.proof_b = proof_b;
        p.proof_c = proof_c;
        p.public_inputs = public_inputs;
        p.consumed = false;
        p.bump = ctx.bumps.proof_data;
        let _ = proof_nonce; // consumed by the #[instruction] macro for PDA seed derivation
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
        require!(
            ctx.accounts.state.is_known_root(args.root),
            PoolError::UnknownRoot
        );
        require_valid_denomination(args.denomination_lamports)?;
        verify_withdraw_proof(&args, &ctx.accounts.proof_data)?;
        // Mark consumed before CPI to prevent re-entrancy on the proof account.
        ctx.accounts.proof_data.consumed = true;
        register_and_spend_withdraw_nullifier(&ctx, &args)?;
        require!(
            ctx.accounts.state.exit_queue.len() < MAX_EXIT_QUEUE,
            PoolError::ExitQueueFull
        );

        ctx.accounts.state.exit_queue.push(QueuedExit {
            stealth_address: args.stealth_address,
            amount_lamports: args.denomination_lamports,
            relay_nonce: args.relay_nonce,
            exit_kind: ExitKind::Withdrawal,
        });
        Ok(())
    }

    pub fn disburse(
        ctx: Context<Disburse>,
        amount_lamports: u64,
        stealth_address: Pubkey,
        relay_nonce: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, PoolError::InvalidAmount);
        require!(
            ctx.accounts.state.exit_queue.len() < MAX_EXIT_QUEUE,
            PoolError::ExitQueueFull
        );

        ctx.accounts.state.exit_queue.push(QueuedExit {
            stealth_address,
            amount_lamports,
            relay_nonce,
            exit_kind: ExitKind::BorrowDisbursement,
        });
        Ok(())
    }

    pub fn flush_exits(ctx: Context<FlushExits>) -> Result<()> {
        require!(
            ctx.accounts.state.protocol_mode != ProtocolMode::Emergency,
            PoolError::EmergencyMode
        );
        // SOL transfer fan-out is intentionally left for the PER adapter. A base
        // Solana loop over arbitrary exits would create CU and privacy problems.
        require!(
            ctx.accounts.state.exit_queue.is_empty(),
            PoolError::PerAdapterNotWired
        );
        Ok(())
    }
}

fn require_valid_denomination(amount: u64) -> Result<()> {
    require!(
        matches!(amount, 100_000_000 | 1_000_000_000 | 10_000_000_000),
        PoolError::InvalidDenomination
    );
    Ok(())
}

fn verify_withdraw_proof(args: &WithdrawArgs, proof: &ProofData) -> Result<()> {
    require!(!proof.consumed, PoolError::ProofAccountConsumed);
    require!(
        proof.circuit_kind == ProofKind::Withdraw,
        PoolError::WrongProofKind
    );
    require!(
        proof.proof_a != [0u8; 64],
        PoolError::Groth16VerificationFailed
    );

    // Cross-field consistency: proof public signals must match instruction args.
    // withdraw_ring public signal ordering (see circuits/public_signals.json):
    //   [0]     denomination  (u64 as BE u256)
    //   [1..16] ring[0..15]
    //   [17]    nullifierHash
    //   [18]    root
    let mut expected_denom = [0u8; 32];
    expected_denom[24..32].copy_from_slice(&args.denomination_lamports.to_be_bytes());
    require!(
        proof.public_inputs[0] == expected_denom,
        PoolError::Groth16VerificationFailed
    );
    require!(
        proof.public_inputs[17] == args.nullifier_hash,
        PoolError::Groth16VerificationFailed
    );
    require!(
        proof.public_inputs[18] == args.root,
        PoolError::Groth16VerificationFailed
    );

    let ok = groth16_verifier::verify_withdraw_groth16(
        &proof.proof_a,
        &proof.proof_b,
        &proof.proof_c,
        &proof.public_inputs,
    )
    .map_err(|_| error!(PoolError::Groth16VerificationFailed))?;
    require!(ok, PoolError::Groth16VerificationFailed);
    Ok(())
}

fn register_and_spend_withdraw_nullifier(
    ctx: &Context<Withdraw>,
    args: &WithdrawArgs,
) -> Result<()> {
    let writer_bump = ctx.bumps.registry_writer;
    let signer_seeds: &[&[&[u8]]] = &[&[REGISTRY_WRITER_SEED, &[writer_bump]]];
    let registry_program = ctx.accounts.nullifier_registry_program.to_account_info();

    nullifier_registry::cpi::register(
        CpiContext::new_with_signer(
            registry_program.clone(),
            registry_accounts::RegisterNullifier {
                payer: ctx.accounts.relay.to_account_info(),
                writer: ctx.accounts.registry_writer.to_account_info(),
                config: ctx.accounts.registry_config.to_account_info(),
                nullifier: ctx.accounts.nullifier.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            signer_seeds,
        ),
        args.nullifier_hash,
        ctx.accounts.state.next_index,
    )?;

    // Direct withdrawal uses the same Locked -> Spent guard as borrowed
    // collateral instead of bypassing it with an Active -> Spent transition.
    nullifier_registry::cpi::lock(CpiContext::new_with_signer(
        registry_program.clone(),
        registry_accounts::MutateNullifier {
            writer: ctx.accounts.registry_writer.to_account_info(),
            config: ctx.accounts.registry_config.to_account_info(),
            nullifier: ctx.accounts.nullifier.to_account_info(),
        },
        signer_seeds,
    ))?;

    nullifier_registry::cpi::spend(CpiContext::new_with_signer(
        registry_program,
        registry_accounts::MutateNullifier {
            writer: ctx.accounts.registry_writer.to_account_info(),
            config: ctx.accounts.registry_config.to_account_info(),
            nullifier: ctx.accounts.nullifier.to_account_info(),
        },
        signer_seeds,
    ))
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = ShieldedPoolState::SPACE,
        seeds = [b"shielded-pool-state"],
        bump
    )]
    pub state: Account<'info, ShieldedPoolState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub relay: Signer<'info>,
    #[account(mut, seeds = [b"shielded-pool-state"], bump = state.bump)]
    pub state: Account<'info, ShieldedPoolState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlushEpoch<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"shielded-pool-state"],
        bump = state.bump,
        has_one = authority @ PoolError::Unauthorized
    )]
    pub state: Account<'info, ShieldedPoolState>,
}

/// Context for store_withdraw_proof.
/// proof_nonce is the PDA seed component; pass the same value to withdraw as
/// WithdrawArgs.proof_nonce to identify the proof account.
#[derive(Accounts)]
#[instruction(proof_nonce: [u8; 32])]
pub struct StoreWithdrawProof<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = ProofData::SPACE,
        seeds = [PROOF_DATA_SEED, authority.key().as_ref(), proof_nonce.as_ref()],
        bump
    )]
    pub proof_data: Account<'info, ProofData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub relay: Signer<'info>,
    /// Box<Account> keeps ShieldedPoolState (~1100 bytes) on the heap, reducing
    /// try_accounts and the entry-point stack frame (B7 mitigation).
    #[account(mut, seeds = [b"shielded-pool-state"], bump = state.bump)]
    pub state: Box<Account<'info, ShieldedPoolState>>,
    /// CHECK: created and mutated by the nullifier registry CPI.
    #[account(
        mut,
        seeds = [b"nullifier", args.nullifier_hash.as_ref()],
        bump,
        seeds::program = nullifier_registry::ID
    )]
    pub nullifier: UncheckedAccount<'info>,
    #[account(
        seeds = [b"registry-config"],
        bump = registry_config.bump,
        seeds::program = nullifier_registry::ID
    )]
    pub registry_config: Account<'info, RegistryConfig>,
    /// CHECK: ShieldedPool registry-writer PDA; signed only through invoke_signed.
    #[account(seeds = [REGISTRY_WRITER_SEED], bump)]
    pub registry_writer: UncheckedAccount<'info>,
    pub nullifier_registry_program: Program<'info, NullifierRegistry>,
    pub system_program: Program<'info, System>,
    /// Proof account written by store_withdraw_proof; consumed after use.
    /// PDA seeds must match: [PROOF_DATA_SEED, relay, args.proof_nonce].
    /// Box<Account> keeps the 908-byte ProofData on the heap (B7 mitigation).
    #[account(
        mut,
        seeds = [PROOF_DATA_SEED, relay.key().as_ref(), args.proof_nonce.as_ref()],
        bump = proof_data.bump,
        constraint = proof_data.authority == relay.key() @ PoolError::ProofAccountOwnerMismatch,
        constraint = !proof_data.consumed @ PoolError::ProofAccountConsumed,
        constraint = proof_data.circuit_kind == ProofKind::Withdraw @ PoolError::WrongProofKind,
    )]
    pub proof_data: Box<Account<'info, ProofData>>,
}

#[derive(Accounts)]
pub struct Disburse<'info> {
    #[account(
        seeds = [LENDING_POOL_AUTHORITY_SEED],
        bump,
        seeds::program = LENDING_POOL_PROGRAM_ID
    )]
    pub lending_pool_authority: Signer<'info>,
    #[account(mut, seeds = [b"shielded-pool-state"], bump = state.bump)]
    pub state: Account<'info, ShieldedPoolState>,
}

#[derive(Accounts)]
pub struct FlushExits<'info> {
    pub relay: Signer<'info>,
    #[account(mut, seeds = [b"shielded-pool-state"], bump = state.bump)]
    pub state: Account<'info, ShieldedPoolState>,
}

#[account]
pub struct ShieldedPoolState {
    pub authority: Pubkey,
    pub current_root: [u8; 32],
    pub historical_roots: [[u8; 32]; ROOT_HISTORY_SIZE],
    pub root_index: u8,
    pub next_index: u64,
    pub epoch_commitments: Vec<QueuedDeposit>,
    pub exit_queue: Vec<QueuedExit>,
    pub epoch_start_slot: u64,
    pub epochs_without_per_flush: u8,
    pub protocol_mode: ProtocolMode,
    pub bump: u8,
}

impl ShieldedPoolState {
    pub const SPACE: usize = 8
        + 32
        + 32
        + (ROOT_HISTORY_SIZE * 32)
        + 1
        + 8
        + 4
        + (MAX_EPOCH_COMMITMENTS * QueuedDeposit::SPACE)
        + 4
        + (MAX_EXIT_QUEUE * QueuedExit::SPACE)
        + 8
        + 1
        + 1
        + 1;

    pub fn is_known_root(&self, root: [u8; 32]) -> bool {
        if root == [0; 32] || self.next_index == 0 {
            return false;
        }
        root == self.current_root || self.historical_roots.iter().any(|item| item == &root)
    }
}

/// Proof account for DEV/TEST Groth16 withdraw proofs.
/// Written by store_withdraw_proof; read and consumed by withdraw.
/// Space: ProofData::SPACE bytes.
#[account]
pub struct ProofData {
    pub authority: Pubkey,
    pub circuit_kind: ProofKind,
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
    /// 19 public signals in withdraw_ring order (circuits/public_signals.json).
    pub public_inputs: [[u8; 32]; 19],
    pub consumed: bool,
    pub bump: u8,
}

impl ProofData {
    // discriminator(8) + authority(32) + circuit_kind(1) +
    // proof_a(64) + proof_b(128) + proof_c(64) + public_inputs(19*32=608) +
    // consumed(1) + bump(1) + 1 padding = 908
    pub const SPACE: usize = 8 + 32 + 1 + 64 + 128 + 64 + (19 * 32) + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProofKind {
    Withdraw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct QueuedDeposit {
    pub commitment: [u8; 32],
    pub denomination_lamports: u64,
    pub relay_nonce: u64,
    pub inserted_at_slot: u64,
}

impl QueuedDeposit {
    pub const SPACE: usize = 32 + 8 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct QueuedExit {
    pub stealth_address: Pubkey,
    pub amount_lamports: u64,
    pub relay_nonce: u64,
    pub exit_kind: ExitKind,
}

impl QueuedExit {
    pub const SPACE: usize = 32 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolMode {
    FullPrivacy,
    Degraded,
    Emergency,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum ExitKind {
    Withdrawal,
    BorrowDisbursement,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawArgs {
    pub root: [u8; 32],
    pub nullifier_hash: [u8; 32],
    pub denomination_lamports: u64,
    pub stealth_address: Pubkey,
    pub relay_nonce: u64,
    /// PDA nonce used to locate the proof account written by store_withdraw_proof.
    /// Must match the proof_nonce passed to store_withdraw_proof.
    /// Compute budget: prepend ComputeBudgetProgram::set_compute_unit_limit(1_400_000).
    pub proof_nonce: [u8; 32],
}

#[error_code]
pub enum PoolError {
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("Invalid fixed denomination")]
    InvalidDenomination,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Epoch queue is full")]
    EpochQueueFull,
    #[msg("Exit queue is full")]
    ExitQueueFull,
    #[msg("Inserted count does not match queued commitments")]
    InsertedCountMismatch,
    #[msg("MagicBlock VRF proof/randomness has not been provided")]
    MissingVrf,
    #[msg("Merkle root is not in the retained root history")]
    UnknownRoot,
    #[msg("Groth16 verifier is not wired yet")]
    Groth16VerifierNotWired,
    #[msg("Groth16 proof verification failed")]
    Groth16VerificationFailed,
    #[msg("PER exit adapter is not wired yet")]
    PerAdapterNotWired,
    #[msg("Protocol is in emergency mode")]
    EmergencyMode,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Proof account authority does not match relay signer")]
    ProofAccountOwnerMismatch,
    #[msg("Proof account has already been consumed")]
    ProofAccountConsumed,
    #[msg("Proof account is for the wrong circuit")]
    WrongProofKind,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_withdraw_proof_data(
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 19],
    ) -> ProofData {
        ProofData {
            authority: Pubkey::new_unique(),
            circuit_kind: ProofKind::Withdraw,
            proof_a,
            proof_b,
            proof_c,
            public_inputs,
            consumed: false,
            bump: 255,
        }
    }

    fn make_withdraw_args(root: [u8; 32], nullifier_hash: [u8; 32]) -> WithdrawArgs {
        WithdrawArgs {
            root,
            nullifier_hash,
            denomination_lamports: 100_000_000,
            stealth_address: Pubkey::new_unique(),
            relay_nonce: 1,
            proof_nonce: [1u8; 32],
        }
    }

    #[test]
    fn fixed_denominations_are_the_only_valid_deposit_amounts() {
        assert!(require_valid_denomination(100_000_000).is_ok());
        assert!(require_valid_denomination(1_000_000_000).is_ok());
        assert!(require_valid_denomination(10_000_000_000).is_ok());
        assert!(require_valid_denomination(99_999_999).is_err());
        assert!(require_valid_denomination(2_000_000_000).is_err());
        assert!(require_valid_denomination(0).is_err());
    }

    #[test]
    fn root_history_accepts_current_and_retained_roots_only() {
        let retained_root = [7u8; 32];
        let current_root = [9u8; 32];
        let unknown_root = [11u8; 32];
        let mut state = ShieldedPoolState {
            authority: Pubkey::new_unique(),
            current_root,
            historical_roots: [[0; 32]; ROOT_HISTORY_SIZE],
            root_index: 0,
            next_index: 0,
            epoch_commitments: Vec::new(),
            exit_queue: Vec::new(),
            epoch_start_slot: 0,
            epochs_without_per_flush: 0,
            protocol_mode: ProtocolMode::FullPrivacy,
            bump: 255,
        };
        state.next_index = 2;
        state.historical_roots[3] = retained_root;

        assert!(state.is_known_root(current_root));
        assert!(state.is_known_root(retained_root));
        assert!(!state.is_known_root(unknown_root));
    }

    #[test]
    fn root_history_rejects_zero_root_and_empty_tree() {
        let mut state = ShieldedPoolState {
            authority: Pubkey::new_unique(),
            current_root: [0; 32],
            historical_roots: [[0; 32]; ROOT_HISTORY_SIZE],
            root_index: 0,
            next_index: 0,
            epoch_commitments: Vec::new(),
            exit_queue: Vec::new(),
            epoch_start_slot: 0,
            epochs_without_per_flush: 0,
            protocol_mode: ProtocolMode::FullPrivacy,
            bump: 255,
        };

        assert!(!state.is_known_root([0; 32]));
        assert!(!state.is_known_root([9; 32]));

        state.next_index = 1;
        state.current_root = [9; 32];
        assert!(!state.is_known_root([0; 32]));
        assert!(state.is_known_root([9; 32]));
    }

    #[test]
    fn lending_pool_authority_pda_is_not_any_signer() {
        let (authority, _) =
            Pubkey::find_program_address(&[LENDING_POOL_AUTHORITY_SEED], &LENDING_POOL_PROGRAM_ID);

        assert_ne!(authority, Pubkey::new_unique());
    }

    #[test]
    fn proof_data_space_constant_matches_struct_layout() {
        // discriminator(8) + authority(32) + circuit_kind(1) +
        // proof_a(64) + proof_b(128) + proof_c(64) + public_inputs(19*32=608) +
        // consumed(1) + bump(1) = 908
        assert_eq!(ProofData::SPACE, 908);
    }

    #[test]
    fn store_withdraw_proof_stores_expected_payload() {
        use crate::groth16_verifier::tests::{
            WITHDRAW_SMOKE_PROOF_A, WITHDRAW_SMOKE_PROOF_B, WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        };
        let proof = make_withdraw_proof_data(
            WITHDRAW_SMOKE_PROOF_A,
            WITHDRAW_SMOKE_PROOF_B,
            WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        );
        assert_eq!(proof.circuit_kind, ProofKind::Withdraw);
        assert_eq!(proof.proof_a, WITHDRAW_SMOKE_PROOF_A);
        assert_eq!(proof.proof_b, WITHDRAW_SMOKE_PROOF_B);
        assert_eq!(proof.proof_c, WITHDRAW_SMOKE_PROOF_C);
        assert_eq!(proof.public_inputs, WITHDRAW_SMOKE_PUBLIC_SIGNALS);
        assert!(!proof.consumed);
    }

    #[test]
    fn withdraw_proof_with_valid_smoke_vector_passes() {
        use crate::groth16_verifier::tests::{
            WITHDRAW_SMOKE_PROOF_A, WITHDRAW_SMOKE_PROOF_B, WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        };
        let args = make_withdraw_args(
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[18],
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[17],
        );
        let proof = make_withdraw_proof_data(
            WITHDRAW_SMOKE_PROOF_A,
            WITHDRAW_SMOKE_PROOF_B,
            WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_withdraw_proof(&args, &proof).is_ok());
    }

    #[test]
    fn withdraw_proof_with_empty_proof_fails() {
        use crate::groth16_verifier::tests::WITHDRAW_SMOKE_PUBLIC_SIGNALS;
        let args = make_withdraw_args(
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[18],
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[17],
        );
        let proof = make_withdraw_proof_data(
            [0u8; 64],
            [0u8; 128],
            [0u8; 64],
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_withdraw_proof(&args, &proof).is_err());
    }

    #[test]
    fn withdraw_proof_with_mutated_proof_fails() {
        use crate::groth16_verifier::tests::{
            WITHDRAW_SMOKE_PROOF_A, WITHDRAW_SMOKE_PROOF_B, WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        };
        let args = make_withdraw_args(
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[18],
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[17],
        );
        let mut bad_a = WITHDRAW_SMOKE_PROOF_A;
        bad_a[32] ^= 0xff;
        let proof = make_withdraw_proof_data(
            bad_a,
            WITHDRAW_SMOKE_PROOF_B,
            WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_withdraw_proof(&args, &proof).is_err());
    }

    #[test]
    fn withdraw_proof_with_mismatched_nullifier_fails() {
        use crate::groth16_verifier::tests::{
            WITHDRAW_SMOKE_PROOF_A, WITHDRAW_SMOKE_PROOF_B, WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        };
        // args.nullifier_hash disagrees with public_inputs[17]; caught by cross-check.
        let args = make_withdraw_args(WITHDRAW_SMOKE_PUBLIC_SIGNALS[18], [0xde; 32]);
        let proof = make_withdraw_proof_data(
            WITHDRAW_SMOKE_PROOF_A,
            WITHDRAW_SMOKE_PROOF_B,
            WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_withdraw_proof(&args, &proof).is_err());
    }

    #[test]
    fn withdraw_with_consumed_proof_fails() {
        use crate::groth16_verifier::tests::{
            WITHDRAW_SMOKE_PROOF_A, WITHDRAW_SMOKE_PROOF_B, WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        };
        let args = make_withdraw_args(
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[18],
            WITHDRAW_SMOKE_PUBLIC_SIGNALS[17],
        );
        let mut proof = make_withdraw_proof_data(
            WITHDRAW_SMOKE_PROOF_A,
            WITHDRAW_SMOKE_PROOF_B,
            WITHDRAW_SMOKE_PROOF_C,
            WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        );
        proof.consumed = true;
        assert!(verify_withdraw_proof(&args, &proof).is_err());
    }
}
