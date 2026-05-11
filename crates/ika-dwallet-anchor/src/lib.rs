// Copyright (c) dWallet Labs, Ltd.
// SPDX-License-Identifier: BSD-3-Clause-Clear
//
// Adapted from the official IKA pre-alpha Anchor CPI SDK:
// https://github.com/dwallet-labs/ika-pre-alpha/tree/main/chains/solana/program-sdk/anchor
//
// Compatibility note: the official pre-alpha crate currently targets
// anchor-lang = "1". This local crate preserves the documented CPI ABI while
// compiling against ShieldLend's Anchor 0.32.1 workspace.

use anchor_lang::prelude::*;

/// Seed for deriving the CPI authority PDA from a caller program.
pub const CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

const IX_APPROVE_MESSAGE: u8 = 8;
const IX_TRANSFER_OWNERSHIP: u8 = 24;
const IX_TRANSFER_FUTURE_SIGN: u8 = 42;

/// CPI context for invoking IKA dWallet instructions from Anchor programs.
pub struct DWalletContext<'info> {
    /// The IKA dWallet program account.
    pub dwallet_program: AccountInfo<'info>,
    /// The CPI authority PDA derived from the caller program.
    pub cpi_authority: AccountInfo<'info>,
    /// The calling program account.
    pub caller_program: AccountInfo<'info>,
    /// Bump seed for the CPI authority PDA.
    pub cpi_authority_bump: u8,
}

impl<'info> DWalletContext<'info> {
    /// Approve a message for signing via IKA dWallet CPI.
    ///
    /// Creates a MessageApproval PDA on behalf of the calling program. The
    /// target dWallet's authority must already be set to this program's CPI
    /// authority PDA.
    pub fn approve_message(
        &self,
        coordinator: &AccountInfo<'info>,
        message_approval: &AccountInfo<'info>,
        dwallet: &AccountInfo<'info>,
        payer: &AccountInfo<'info>,
        system_program: &AccountInfo<'info>,
        message_digest: [u8; 32],
        message_metadata_digest: [u8; 32],
        user_pubkey: [u8; 32],
        signature_scheme: u16,
        bump: u8,
    ) -> Result<()> {
        let mut ix_data = Vec::with_capacity(100);
        ix_data.push(IX_APPROVE_MESSAGE);
        ix_data.push(bump);
        ix_data.extend_from_slice(&message_digest);
        ix_data.extend_from_slice(&message_metadata_digest);
        ix_data.extend_from_slice(&user_pubkey);
        ix_data.extend_from_slice(&signature_scheme.to_le_bytes());

        let accounts = vec![
            AccountMeta::new_readonly(coordinator.key(), false),
            AccountMeta::new(message_approval.key(), false),
            AccountMeta::new_readonly(dwallet.key(), false),
            AccountMeta::new_readonly(self.caller_program.key(), false),
            AccountMeta::new_readonly(self.cpi_authority.key(), true),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
        ];

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: self.dwallet_program.key(),
            accounts,
            data: ix_data,
        };

        let account_infos = vec![
            coordinator.clone(),
            message_approval.clone(),
            dwallet.clone(),
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            payer.clone(),
            system_program.clone(),
            self.dwallet_program.clone(),
        ];

        let seeds = &[CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        anchor_lang::solana_program::program::invoke_signed(&ix, &account_infos, signer_seeds)?;
        Ok(())
    }

    /// Transfer dWallet authority via IKA dWallet CPI.
    pub fn transfer_dwallet(
        &self,
        dwallet: &AccountInfo<'info>,
        new_authority: &Pubkey,
    ) -> Result<()> {
        let mut ix_data = Vec::with_capacity(33);
        ix_data.push(IX_TRANSFER_OWNERSHIP);
        ix_data.extend_from_slice(new_authority.as_ref());

        let accounts = vec![
            AccountMeta::new_readonly(self.caller_program.key(), false),
            AccountMeta::new_readonly(self.cpi_authority.key(), true),
            AccountMeta::new(dwallet.key(), false),
        ];

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: self.dwallet_program.key(),
            accounts,
            data: ix_data,
        };

        let account_infos = vec![
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            dwallet.clone(),
            self.dwallet_program.clone(),
        ];

        let seeds = &[CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        anchor_lang::solana_program::program::invoke_signed(&ix, &account_infos, signer_seeds)?;
        Ok(())
    }

    /// Transfer FutureSign completion authority via IKA dWallet CPI.
    pub fn transfer_future_sign(
        &self,
        partial_user_sig: &AccountInfo<'info>,
        new_authority: &Pubkey,
    ) -> Result<()> {
        let mut ix_data = Vec::with_capacity(33);
        ix_data.push(IX_TRANSFER_FUTURE_SIGN);
        ix_data.extend_from_slice(new_authority.as_ref());

        let accounts = vec![
            AccountMeta::new(partial_user_sig.key(), false),
            AccountMeta::new_readonly(self.caller_program.key(), false),
            AccountMeta::new_readonly(self.cpi_authority.key(), true),
        ];

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: self.dwallet_program.key(),
            accounts,
            data: ix_data,
        };

        let account_infos = vec![
            partial_user_sig.clone(),
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            self.dwallet_program.clone(),
        ];

        let seeds = &[CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        anchor_lang::solana_program::program::invoke_signed(&ix, &account_infos, signer_seeds)?;
        Ok(())
    }
}
