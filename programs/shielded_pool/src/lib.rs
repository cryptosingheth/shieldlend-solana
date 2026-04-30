// ============================================================
// Program: ShieldedPool
// Framework: Anchor
// Testing:   TypeScript/Anchor
// Risk Level: Critical
// Security: See security-checklist.md
// ============================================================

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("EKMPkr2qFAQ8g7P4rNsaGPKVpx2T7eC5fDzYXwfWJge7");

pub const ROOT_HISTORY_SIZE: usize = 30;
pub const MAX_EPOCH_COMMITMENTS: usize = 128;
pub const MAX_EXIT_QUEUE: usize = 128;

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

    pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
        require!(ctx.accounts.state.is_known_root(args.root), PoolError::UnknownRoot);
        require_valid_denomination(args.denomination_lamports)?;
        verify_withdraw_proof(&args)?;
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

    pub fn disburse(ctx: Context<Disburse>, amount_lamports: u64, stealth_address: Pubkey, relay_nonce: u64) -> Result<()> {
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
        require!(ctx.accounts.state.exit_queue.is_empty(), PoolError::PerAdapterNotWired);
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

fn verify_withdraw_proof(_args: &WithdrawArgs) -> Result<()> {
    err!(PoolError::Groth16VerifierNotWired)
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

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub relay: Signer<'info>,
    #[account(mut, seeds = [b"shielded-pool-state"], bump = state.bump)]
    pub state: Account<'info, ShieldedPoolState>,
}

#[derive(Accounts)]
pub struct Disburse<'info> {
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
        + 4 + (MAX_EPOCH_COMMITMENTS * QueuedDeposit::SPACE)
        + 4 + (MAX_EXIT_QUEUE * QueuedExit::SPACE)
        + 8
        + 1
        + 1
        + 1;

    pub fn is_known_root(&self, root: [u8; 32]) -> bool {
        root == self.current_root || self.historical_roots.iter().any(|item| item == &root)
    }
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
    #[msg("PER exit adapter is not wired yet")]
    PerAdapterNotWired,
    #[msg("Protocol is in emergency mode")]
    EmergencyMode,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

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
        state.historical_roots[3] = retained_root;

        assert!(state.is_known_root(current_root));
        assert!(state.is_known_root(retained_root));
        assert!(!state.is_known_root(unknown_root));
    }

    #[test]
    fn verifier_guards_fail_closed_until_real_verifier_is_configured() {
        let args = WithdrawArgs {
            root: [1; 32],
            nullifier_hash: [2; 32],
            denomination_lamports: 100_000_000,
            stealth_address: Pubkey::new_unique(),
            relay_nonce: 1,
        };
        assert!(verify_withdraw_proof(&args).is_err());
    }
}
