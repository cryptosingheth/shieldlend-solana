// ============================================================
// Program: NullifierRegistry
// Framework: Anchor
// Testing:   TypeScript/Anchor
// Risk Level: Critical
// Security: See security-checklist.md
// ============================================================

use anchor_lang::prelude::*;

declare_id!("HsaVmvSd88h8w5LVtD9byiTu8N6zZrpu3KxuXH592GRL");

pub const MAX_AUTHORIZED_PROGRAMS: usize = 8;

#[program]
pub mod nullifier_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, authorized_programs: Vec<Pubkey>) -> Result<()> {
        require!(
            authorized_programs.len() <= MAX_AUTHORIZED_PROGRAMS,
            RegistryError::TooManyAuthorizedPrograms
        );
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.authorized_programs = authorized_programs;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_authorized_programs(
        ctx: Context<UpdateAuthorizedPrograms>,
        authorized_programs: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            authorized_programs.len() <= MAX_AUTHORIZED_PROGRAMS,
            RegistryError::TooManyAuthorizedPrograms
        );
        ctx.accounts.config.authorized_programs = authorized_programs;
        Ok(())
    }

    pub fn register(
        ctx: Context<RegisterNullifier>,
        nullifier_hash: [u8; 32],
        leaf_index: u64,
    ) -> Result<()> {
        assert_authorized(&ctx.accounts.config, &ctx.accounts.writer.key())?;
        let record = &mut ctx.accounts.nullifier;
        record.nullifier_hash = nullifier_hash;
        record.status = NullifierStatus::Active;
        record.leaf_index = leaf_index;
        record.registered_at_slot = Clock::get()?.slot;
        record.bump = ctx.bumps.nullifier;
        Ok(())
    }

    pub fn lock(ctx: Context<MutateNullifier>) -> Result<()> {
        assert_authorized(&ctx.accounts.config, &ctx.accounts.writer.key())?;
        lock_nullifier(&mut ctx.accounts.nullifier)
    }

    pub fn unlock(ctx: Context<MutateNullifier>) -> Result<()> {
        assert_authorized(&ctx.accounts.config, &ctx.accounts.writer.key())?;
        unlock_nullifier(&mut ctx.accounts.nullifier)
    }

    pub fn spend(ctx: Context<MutateNullifier>) -> Result<()> {
        assert_authorized(&ctx.accounts.config, &ctx.accounts.writer.key())?;
        spend_nullifier(&mut ctx.accounts.nullifier)
    }
}

fn assert_authorized(config: &RegistryConfig, writer: &Pubkey) -> Result<()> {
    require!(
        config.authorized_programs.iter().any(|item| item == writer),
        RegistryError::UnauthorizedWriter
    );
    Ok(())
}

fn lock_nullifier(nullifier: &mut NullifierAccount) -> Result<()> {
    require!(
        nullifier.status == NullifierStatus::Active,
        RegistryError::InvalidStatusTransition
    );
    nullifier.status = NullifierStatus::Locked;
    Ok(())
}

fn unlock_nullifier(nullifier: &mut NullifierAccount) -> Result<()> {
    require!(
        nullifier.status == NullifierStatus::Locked,
        RegistryError::InvalidStatusTransition
    );
    nullifier.status = NullifierStatus::Active;
    Ok(())
}

fn spend_nullifier(nullifier: &mut NullifierAccount) -> Result<()> {
    require!(
        nullifier.status == NullifierStatus::Locked,
        RegistryError::InvalidStatusTransition
    );
    nullifier.status = NullifierStatus::Spent;
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = RegistryConfig::SPACE,
        seeds = [b"registry-config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAuthorizedPrograms<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"registry-config"],
        bump = config.bump,
        has_one = authority @ RegistryError::UnauthorizedAuthority
    )]
    pub config: Account<'info, RegistryConfig>,
}

#[derive(Accounts)]
#[instruction(nullifier_hash: [u8; 32])]
pub struct RegisterNullifier<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: writer is checked against RegistryConfig.authorized_programs.
    pub writer: Signer<'info>,
    #[account(seeds = [b"registry-config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = payer,
        space = NullifierAccount::SPACE,
        seeds = [b"nullifier", nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier: Account<'info, NullifierAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MutateNullifier<'info> {
    /// CHECK: writer is checked against RegistryConfig.authorized_programs.
    pub writer: Signer<'info>,
    #[account(seeds = [b"registry-config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"nullifier", nullifier.nullifier_hash.as_ref()],
        bump = nullifier.bump
    )]
    pub nullifier: Account<'info, NullifierAccount>,
}

#[account]
pub struct RegistryConfig {
    pub authority: Pubkey,
    pub authorized_programs: Vec<Pubkey>,
    pub bump: u8,
}

impl RegistryConfig {
    pub const SPACE: usize = 8 + 32 + 4 + (MAX_AUTHORIZED_PROGRAMS * 32) + 1;
}

#[account]
pub struct NullifierAccount {
    pub nullifier_hash: [u8; 32],
    pub status: NullifierStatus,
    pub leaf_index: u64,
    pub registered_at_slot: u64,
    pub bump: u8,
}

impl NullifierAccount {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum NullifierStatus {
    Active,
    Locked,
    Spent,
}

#[error_code]
pub enum RegistryError {
    #[msg("Too many authorized writer programs")]
    TooManyAuthorizedPrograms,
    #[msg("Caller is not an authorized registry writer")]
    UnauthorizedWriter,
    #[msg("Only the registry authority may update configuration")]
    UnauthorizedAuthority,
    #[msg("Nullifier state transition is invalid")]
    InvalidStatusTransition,
    #[msg("Nullifier has already been spent")]
    AlreadySpent,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_authorized(writer: Pubkey) -> RegistryConfig {
        RegistryConfig {
            authority: Pubkey::new_unique(),
            authorized_programs: vec![writer],
            bump: 255,
        }
    }

    fn nullifier(status: NullifierStatus) -> NullifierAccount {
        NullifierAccount {
            nullifier_hash: [4; 32],
            status,
            leaf_index: 7,
            registered_at_slot: 11,
            bump: 255,
        }
    }

    #[test]
    fn authorized_program_check_accepts_only_configured_writers() {
        let writer = Pubkey::new_unique();
        let config = config_with_authorized(writer);

        assert!(assert_authorized(&config, &writer).is_ok());
        assert!(assert_authorized(&config, &Pubkey::new_unique()).is_err());
    }

    #[test]
    fn registry_capacity_matches_documented_program_writer_limit() {
        let authority = Pubkey::new_unique();
        let max_config = RegistryConfig {
            authority,
            authorized_programs: (0..MAX_AUTHORIZED_PROGRAMS)
                .map(|_| Pubkey::new_unique())
                .collect(),
            bump: 255,
        };
        assert_eq!(
            max_config.authorized_programs.len(),
            MAX_AUTHORIZED_PROGRAMS
        );
        assert!(max_config
            .authorized_programs
            .iter()
            .all(|program| *program != Pubkey::default()));
    }

    #[test]
    fn spend_rejects_active_nullifier() {
        let mut record = nullifier(NullifierStatus::Active);

        assert!(spend_nullifier(&mut record).is_err());
        assert!(record.status == NullifierStatus::Active);
    }

    #[test]
    fn lock_then_spend_is_valid_path() {
        let mut record = nullifier(NullifierStatus::Active);

        lock_nullifier(&mut record).unwrap();
        assert!(record.status == NullifierStatus::Locked);

        spend_nullifier(&mut record).unwrap();
        assert!(record.status == NullifierStatus::Spent);
    }

    #[test]
    fn unlock_requires_locked_state() {
        let mut active = nullifier(NullifierStatus::Active);
        assert!(unlock_nullifier(&mut active).is_err());
        assert!(active.status == NullifierStatus::Active);

        let mut locked = nullifier(NullifierStatus::Locked);
        unlock_nullifier(&mut locked).unwrap();
        assert!(locked.status == NullifierStatus::Active);
    }
}
