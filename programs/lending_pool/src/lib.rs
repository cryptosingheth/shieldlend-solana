// ============================================================
// Program: LendingPool
// Framework: Anchor
// Testing:   TypeScript/Anchor
// Risk Level: Critical
// Security: See security-checklist.md
// ============================================================

pub mod groth16_verifier;

use anchor_lang::prelude::*;
use encrypt_anchor::{
    accounts::{self as encrypt_accounts, DecryptionRequestStatus},
    EncryptContext, CPI_AUTHORITY_SEED as ENCRYPT_CPI_AUTHORITY_SEED,
};
use encrypt_solana_types::accounts as encrypt_account_data;
use encrypt_types::encrypted::Bool;
use ika_dwallet_anchor::{DWalletContext, CPI_AUTHORITY_SEED};
use nullifier_registry::{
    self, cpi::accounts as registry_accounts, program::NullifierRegistry, NullifierAccount,
    RegistryConfig,
};

declare_id!("J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn");

pub const KINK_COUNT: usize = 11;
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const SLOTS_PER_YEAR: u128 = 78_840_000;
pub const REGISTRY_WRITER_SEED: &[u8] = b"registry-writer";
pub const PROOF_DATA_SEED: &[u8] = b"proof-data";
pub const IKA_DWALLET_PROGRAM_ID: Pubkey =
    anchor_lang::pubkey!("87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY");

#[program]
pub mod lending_pool {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        utilization_kinks: [u16; KINK_COUNT],
        rate_at_kink: [u16; KINK_COUNT],
    ) -> Result<()> {
        validate_rate_model(&utilization_kinks, &rate_at_kink)?;
        let model = &mut ctx.accounts.interest_model;
        model.authority = ctx.accounts.authority.key();
        model.utilization_kinks = utilization_kinks;
        model.rate_at_kink = rate_at_kink;
        model.last_updated = Clock::get()?.unix_timestamp;
        model.bump = ctx.bumps.interest_model;
        Ok(())
    }

    /// Write a Groth16 collateral proof to a PDA before calling borrow.
    ///
    /// Two-transaction flow (B6 MTU fix):
    ///   1. store_collateral_proof — writes proof bytes to a proof PDA.
    ///   2. borrow                — reads proof from PDA; marks it consumed.
    ///
    /// The proof_nonce seeds the PDA; pass the same nonce as BorrowArgs.proof_nonce.
    /// Transaction size: ~1141 bytes (within 1232-byte Solana MTU).
    pub fn store_collateral_proof(
        ctx: Context<StoreLendingProof>,
        proof_nonce: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 20],
    ) -> Result<()> {
        let p = &mut ctx.accounts.proof_data;
        p.authority = ctx.accounts.authority.key();
        p.circuit_kind = LendingProofKind::Collateral;
        p.proof_a = proof_a;
        p.proof_b = proof_b;
        p.proof_c = proof_c;
        p.public_input_count = 20;
        p.public_inputs = public_inputs;
        p.consumed = false;
        p.bump = ctx.bumps.proof_data;
        let _ = proof_nonce; // consumed by #[instruction] macro for PDA seed derivation
        Ok(())
    }

    /// Write a Groth16 repay proof to a PDA before calling repay.
    ///
    /// Two-transaction flow (B6 MTU fix):
    ///   1. store_repay_proof — writes proof bytes (6 public signals) to a proof PDA.
    ///   2. repay             — reads proof from PDA; marks it consumed.
    ///
    /// The proof_nonce seeds the PDA; pass the same nonce as RepayArgs.proof_nonce.
    /// Transaction size: ~693 bytes (within 1232-byte Solana MTU).
    pub fn store_repay_proof(
        ctx: Context<StoreLendingProof>,
        proof_nonce: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 6],
    ) -> Result<()> {
        let p = &mut ctx.accounts.proof_data;
        p.authority = ctx.accounts.authority.key();
        p.circuit_kind = LendingProofKind::Repay;
        p.proof_a = proof_a;
        p.proof_b = proof_b;
        p.proof_c = proof_c;
        p.public_input_count = 6;
        p.public_inputs[..6].copy_from_slice(&public_inputs);
        p.consumed = false;
        p.bump = ctx.bumps.proof_data;
        let _ = proof_nonce; // consumed by #[instruction] macro for PDA seed derivation
        Ok(())
    }

    pub fn borrow(ctx: Context<Borrow>, args: BorrowArgs) -> Result<()> {
        validate_borrow_args(&args, &ctx.accounts.interest_model)?;
        verify_collateral_proof(&args, &ctx.accounts.proof_data)?;
        // Mark consumed before CPI to prevent re-entrancy on the proof account.
        ctx.accounts.proof_data.consumed = true;
        lock_collateral_nullifier(&ctx)?;

        let clock = Clock::get()?;
        let loan = &mut ctx.accounts.loan;
        loan.collateral_nullifier_hash = args.collateral_nullifier_hash;
        loan.collateral_denomination_class = args.collateral_denomination_class;
        loan.loan_id = args.loan_id;
        loan.disbursed_at_slot = clock.slot;
        loan.borrow_amount = args.borrow_amount;
        loan.borrow_bucket = args.borrow_bucket;
        loan.status = LoanStatus::Active;
        loan.is_liquidatable_handle = [0; 32];
        loan.liq_ciphertext_handle = [0; 32];
        loan.pending_liquidation_reveal = false;
        loan.confirmed_liquidatable = false;
        loan.consecutive_breach_count = 0;
        loan.breach_first_slot = 0;
        loan.future_sign_authorized = args.future_sign_authorized;
        loan.last_accrual_slot = clock.slot;
        loan.interest_rate_bps = args.interest_rate_bps;
        loan.latest_repayment_receipt_hash = [0; 32];
        loan.repayment_vault = args.repayment_vault;
        loan.bump = ctx.bumps.loan;
        Ok(())
    }

    pub fn repay(ctx: Context<Repay>, args: RepayArgs) -> Result<()> {
        let repayment_vault = {
            let loan = &ctx.accounts.loan;
            require!(
                loan.status == LoanStatus::Active,
                LendingError::LoanNotActive
            );

            let outstanding = accrue_outstanding_balance(loan, Clock::get()?.slot)?;
            require!(
                args.outstanding_balance == outstanding,
                LendingError::OutstandingBalanceMismatch
            );
            require!(
                args.nullifier_hash == loan.collateral_nullifier_hash,
                LendingError::NullifierMismatch
            );
            loan.repayment_vault
        };

        verify_repay_proof(&args, &ctx.accounts.proof_data)?;
        ctx.accounts.proof_data.consumed = true;
        verify_private_payment_receipt(&args, repayment_vault)?;
        unlock_collateral_nullifier(&ctx)?;

        let loan = &mut ctx.accounts.loan;
        loan.latest_repayment_receipt_hash = args.settlement_receipt_hash;
        reset_liquidation_state_after_repay(loan);
        loan.status = LoanStatus::Repaid;
        Ok(())
    }

    pub fn request_liquidation_reveal(
        ctx: Context<RequestLiquidationReveal>,
        ciphertext_handle: [u8; 32],
    ) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(
            loan.status == LoanStatus::Active,
            LendingError::LoanNotActive
        );
        require!(
            ciphertext_handle != [0; 32],
            LendingError::InvalidCiphertextHandle
        );
        loan.liq_ciphertext_handle = ciphertext_handle;
        loan.pending_liquidation_reveal = true;
        Ok(())
    }

    pub fn request_liquidation_reveal_via_encrypt(
        ctx: Context<RequestEncryptLiquidationReveal>,
    ) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(
            loan.status == LoanStatus::Active,
            LendingError::LoanNotActive
        );

        let ciphertext_handle = ctx.accounts.ciphertext.key().to_bytes();
        require!(
            ciphertext_handle != [0; 32],
            LendingError::InvalidCiphertextHandle
        );
        require_keys_eq!(
            ctx.accounts.caller_program.key(),
            crate::ID,
            LendingError::EncryptRevealVerificationFailed
        );

        let encrypt_ctx = build_encrypt_context(
            ctx.accounts.encrypt_program.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.deposit.to_account_info(),
            ctx.accounts.cpi_authority.to_account_info(),
            ctx.accounts.caller_program.to_account_info(),
            ctx.accounts.network_encryption_key.to_account_info(),
            ctx.accounts.keeper.to_account_info(),
            ctx.accounts.event_authority.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.bumps.cpi_authority,
        );

        let digest = encrypt_ctx.request_decryption(
            &ctx.accounts.request_acct.to_account_info(),
            &ctx.accounts.ciphertext.to_account_info(),
        )?;

        loan.liq_ciphertext_handle = ciphertext_handle;
        loan.is_liquidatable_handle = digest;
        loan.pending_liquidation_reveal = true;
        Ok(())
    }

    pub fn verify_liquidation_reveal(
        ctx: Context<VerifyLiquidationReveal>,
        args: LiquidationRevealArgs,
    ) -> Result<()> {
        require!(
            ctx.accounts.loan.pending_liquidation_reveal,
            LendingError::LiquidationRevealNotPending
        );
        validate_liquidation_reveal_args(ctx.accounts.loan.key(), &ctx.accounts.loan, &args)?;
        verify_encrypt_reveal(&args)?;
        let loan = &mut ctx.accounts.loan;
        apply_liquidation_reveal_result(loan, args.decrypted_liquidatable, Clock::get()?.slot);
        Ok(())
    }

    pub fn verify_liquidation_reveal_via_encrypt(
        ctx: Context<VerifyEncryptLiquidationReveal>,
    ) -> Result<()> {
        require!(
            ctx.accounts.loan.pending_liquidation_reveal,
            LendingError::LiquidationRevealNotPending
        );

        let decrypted_liquidatable = {
            let request_data = ctx.accounts.request_acct.try_borrow_data()?;
            decode_encrypt_liquidation_reveal(&ctx.accounts.loan, &request_data)?
        };

        let loan = &mut ctx.accounts.loan;
        apply_liquidation_reveal_result(loan, decrypted_liquidatable, Clock::get()?.slot);
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(
            loan.status == LoanStatus::Active,
            LendingError::LoanNotActive
        );
        require!(loan.future_sign_authorized, LendingError::FutureSignMissing);
        require!(loan.confirmed_liquidatable, LendingError::NotLiquidatable);
        require!(
            loan.consecutive_breach_count >= 2,
            LendingError::BreachNotConfirmed
        );
        loan.status = LoanStatus::Liquidated;
        Ok(())
    }

    /// Approve an IKA dWallet message for a borrow/liquidation authority flow.
    ///
    /// This is compile-wired CPI scaffolding for IKA pre-alpha Solana. It does
    /// not create the dWallet, derive the MessageApproval PDA, or complete a
    /// signature. Callers must provide real IKA accounts owned by the deployed
    /// IKA dWallet program. The instruction fails closed if the loan has not
    /// already passed ShieldLend borrow checks and opted into FutureSign.
    pub fn approve_ika_borrow_message(
        ctx: Context<ApproveIkaBorrowMessage>,
        args: IkaApproveMessageArgs,
    ) -> Result<()> {
        validate_ika_approval_args(&args)?;
        require!(
            ctx.accounts.loan.status == LoanStatus::Active,
            LendingError::LoanNotActive
        );
        require!(
            ctx.accounts.loan.future_sign_authorized,
            LendingError::FutureSignMissing
        );

        let dwallet_ctx = DWalletContext {
            dwallet_program: ctx.accounts.dwallet_program.to_account_info(),
            cpi_authority: ctx.accounts.cpi_authority.to_account_info(),
            caller_program: ctx.accounts.program.to_account_info(),
            cpi_authority_bump: ctx.bumps.cpi_authority,
        };

        dwallet_ctx.approve_message(
            &ctx.accounts.coordinator.to_account_info(),
            &ctx.accounts.message_approval.to_account_info(),
            &ctx.accounts.dwallet.to_account_info(),
            &ctx.accounts.payer.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            args.message_digest,
            args.message_metadata_digest,
            args.user_pubkey,
            args.signature_scheme,
            args.message_approval_bump,
        )?;

        Ok(())
    }
}

fn validate_borrow_args(args: &BorrowArgs, interest_model: &InterestRateModel) -> Result<()> {
    require!(args.borrow_amount > 0, LendingError::InvalidAmount);
    require!(
        args.borrow_bucket > 0 && args.borrow_bucket <= BPS_DENOMINATOR as u16,
        LendingError::InvalidBorrowBucket
    );
    require!(
        args.interest_rate_bps <= u64::from(interest_model.rate_at_kink[KINK_COUNT - 1]),
        LendingError::InvalidInterestRate
    );
    require!(
        args.repayment_vault != Pubkey::default(),
        LendingError::InvalidRepaymentVault
    );
    require!(
        args.collateral_nullifier_hash != [0; 32],
        LendingError::InvalidNullifierHash
    );
    Ok(())
}

fn validate_ika_approval_args(args: &IkaApproveMessageArgs) -> Result<()> {
    require!(
        args.message_digest != [0; 32],
        LendingError::InvalidIkaMessageDigest
    );
    require!(
        args.user_pubkey != [0; 32],
        LendingError::InvalidIkaUserPubkey
    );
    Ok(())
}

fn lock_collateral_nullifier(ctx: &Context<Borrow>) -> Result<()> {
    let writer_bump = ctx.bumps.registry_writer;
    let signer_seeds: &[&[&[u8]]] = &[&[REGISTRY_WRITER_SEED, &[writer_bump]]];

    nullifier_registry::cpi::lock(CpiContext::new_with_signer(
        ctx.accounts.nullifier_registry_program.to_account_info(),
        registry_accounts::MutateNullifier {
            writer: ctx.accounts.registry_writer.to_account_info(),
            config: ctx.accounts.registry_config.to_account_info(),
            nullifier: ctx.accounts.nullifier.to_account_info(),
        },
        signer_seeds,
    ))
}

fn unlock_collateral_nullifier(ctx: &Context<Repay>) -> Result<()> {
    let writer_bump = ctx.bumps.registry_writer;
    let signer_seeds: &[&[&[u8]]] = &[&[REGISTRY_WRITER_SEED, &[writer_bump]]];

    nullifier_registry::cpi::unlock(CpiContext::new_with_signer(
        ctx.accounts.nullifier_registry_program.to_account_info(),
        registry_accounts::MutateNullifier {
            writer: ctx.accounts.registry_writer.to_account_info(),
            config: ctx.accounts.registry_config.to_account_info(),
            nullifier: ctx.accounts.nullifier.to_account_info(),
        },
        signer_seeds,
    ))
}

fn reset_liquidation_state_after_repay(loan: &mut LoanAccount) {
    loan.pending_liquidation_reveal = false;
    loan.confirmed_liquidatable = false;
    loan.consecutive_breach_count = 0;
    loan.breach_first_slot = 0;
    loan.liq_ciphertext_handle = [0; 32];
    loan.is_liquidatable_handle = [0; 32];
}

fn apply_liquidation_reveal_result(
    loan: &mut LoanAccount,
    decrypted_liquidatable: bool,
    current_slot: u64,
) {
    loan.confirmed_liquidatable = decrypted_liquidatable;
    loan.pending_liquidation_reveal = false;
    if decrypted_liquidatable {
        loan.consecutive_breach_count = loan.consecutive_breach_count.saturating_add(1);
        if loan.breach_first_slot == 0 {
            loan.breach_first_slot = current_slot;
        }
    } else {
        loan.consecutive_breach_count = 0;
        loan.breach_first_slot = 0;
    }
}

fn validate_liquidation_reveal_args(
    expected_loan_pda: Pubkey,
    loan: &LoanAccount,
    args: &LiquidationRevealArgs,
) -> Result<()> {
    require!(
        args.loan_pda == expected_loan_pda,
        LendingError::LoanPdaMismatch
    );
    require!(
        args.ciphertext_handle == loan.liq_ciphertext_handle,
        LendingError::CiphertextHandleMismatch
    );
    require!(
        args.proof_hash != [0; 32],
        LendingError::InvalidProofSignalHash
    );
    Ok(())
}

fn build_encrypt_context<'info>(
    encrypt_program: AccountInfo<'info>,
    config: AccountInfo<'info>,
    deposit: AccountInfo<'info>,
    cpi_authority: AccountInfo<'info>,
    caller_program: AccountInfo<'info>,
    network_encryption_key: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    event_authority: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    cpi_authority_bump: u8,
) -> EncryptContext<'info> {
    EncryptContext {
        encrypt_program,
        config,
        deposit,
        cpi_authority,
        caller_program,
        network_encryption_key,
        payer,
        event_authority,
        system_program,
        cpi_authority_bump,
    }
}

fn decode_encrypt_liquidation_reveal(loan: &LoanAccount, request_data: &[u8]) -> Result<bool> {
    require!(
        loan.is_liquidatable_handle != [0; 32],
        LendingError::EncryptRevealVerificationFailed
    );

    let ciphertext = encrypt_account_data::parse_decryption_ciphertext(request_data)
        .ok_or(error!(LendingError::EncryptRevealVerificationFailed))?;
    require!(
        *ciphertext == loan.liq_ciphertext_handle,
        LendingError::CiphertextHandleMismatch
    );

    match encrypt_accounts::decryption_status::<Bool>(request_data)
        .map_err(|_| error!(LendingError::EncryptRevealVerificationFailed))?
    {
        DecryptionRequestStatus::Pending | DecryptionRequestStatus::InProgress { .. } => {
            return err!(LendingError::EncryptDecryptionNotReady);
        }
        DecryptionRequestStatus::Complete { .. } => {}
    }

    let value = encrypt_accounts::read_decrypted_verified::<Bool>(
        request_data,
        &loan.is_liquidatable_handle,
    )
    .map_err(|_| error!(LendingError::EncryptRevealVerificationFailed))?;

    Ok(*value)
}

fn validate_rate_model(kinks: &[u16; KINK_COUNT], rates: &[u16; KINK_COUNT]) -> Result<()> {
    require!(kinks[0] == 0, LendingError::InvalidRateModel);
    require!(
        kinks[KINK_COUNT - 1] == 10_000,
        LendingError::InvalidRateModel
    );
    for i in 1..KINK_COUNT {
        require!(kinks[i] > kinks[i - 1], LendingError::InvalidRateModel);
        require!(rates[i] >= rates[i - 1], LendingError::InvalidRateModel);
    }
    Ok(())
}

fn accrue_outstanding_balance(loan: &LoanAccount, current_slot: u64) -> Result<u64> {
    let elapsed = current_slot
        .checked_sub(loan.last_accrual_slot)
        .ok_or(LendingError::ArithmeticOverflow)? as u128;
    let principal = loan.borrow_amount as u128;
    let interest = principal
        .checked_mul(loan.interest_rate_bps as u128)
        .and_then(|v| v.checked_mul(elapsed))
        .and_then(|v| v.checked_div(BPS_DENOMINATOR.checked_mul(SLOTS_PER_YEAR)?))
        .ok_or(LendingError::ArithmeticOverflow)?;
    principal
        .checked_add(interest)
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(error!(LendingError::ArithmeticOverflow))
}

fn verify_collateral_proof(args: &BorrowArgs, proof: &ProofData) -> Result<()> {
    require!(!proof.consumed, LendingError::ProofAccountConsumed);
    require!(
        proof.circuit_kind == LendingProofKind::Collateral,
        LendingError::WrongProofKind
    );
    require!(
        proof.public_input_count == 20,
        LendingError::Groth16VerificationFailed
    );
    require!(
        proof.proof_a != [0u8; 64],
        LendingError::Groth16VerificationFailed
    );

    // Cross-field consistency: proof public signals must match instruction args.
    // collateral_ring public signal ordering (see circuits/public_signals.json):
    //   [0..15]  ring[0..15]
    //   [16]     nullifierHash
    //   [17]     root
    //   [18]     borrowed  (u64 as BE u256)
    //   [19]     minRatioBps  (u16 as BE u256)
    require!(
        proof.public_inputs[16] == args.collateral_nullifier_hash,
        LendingError::Groth16VerificationFailed
    );
    let mut expected_borrow = [0u8; 32];
    expected_borrow[24..32].copy_from_slice(&args.borrow_amount.to_be_bytes());
    require!(
        proof.public_inputs[18] == expected_borrow,
        LendingError::Groth16VerificationFailed
    );
    let mut expected_ratio = [0u8; 32];
    expected_ratio[30..32].copy_from_slice(&args.borrow_bucket.to_be_bytes());
    require!(
        proof.public_inputs[19] == expected_ratio,
        LendingError::Groth16VerificationFailed
    );

    let ok = groth16_verifier::verify_collateral_groth16(
        &proof.proof_a,
        &proof.proof_b,
        &proof.proof_c,
        &proof.public_inputs,
    )
    .map_err(|_| error!(LendingError::Groth16VerificationFailed))?;
    require!(ok, LendingError::Groth16VerificationFailed);
    Ok(())
}

fn verify_repay_proof(args: &RepayArgs, proof: &ProofData) -> Result<()> {
    require!(!proof.consumed, LendingError::ProofAccountConsumed);
    require!(
        proof.circuit_kind == LendingProofKind::Repay,
        LendingError::WrongProofKind
    );
    require!(
        proof.public_input_count == 6,
        LendingError::Groth16VerificationFailed
    );
    require!(
        proof.proof_a != [0u8; 64],
        LendingError::Groth16VerificationFailed
    );

    // Cross-field consistency: proof public signals must match instruction args.
    // repay_ring public signal ordering (see circuits/public_signals.json):
    //   [0]  nullifierHash
    //   [1]  loanId         (u64 as BE u256)
    //   [2]  outstandingBalance  (u64 as BE u256)
    //   [3]  settlementReceiptHash
    //   [4]  repaymentVault  (Pubkey as field element — not cross-checked here)
    //   [5]  receiptBindingHash
    require!(
        proof.public_inputs[0] == args.nullifier_hash,
        LendingError::Groth16VerificationFailed
    );
    let mut expected_loan_id = [0u8; 32];
    expected_loan_id[24..32].copy_from_slice(&args.loan_id.to_be_bytes());
    require!(
        proof.public_inputs[1] == expected_loan_id,
        LendingError::Groth16VerificationFailed
    );
    let mut expected_balance = [0u8; 32];
    expected_balance[24..32].copy_from_slice(&args.outstanding_balance.to_be_bytes());
    require!(
        proof.public_inputs[2] == expected_balance,
        LendingError::Groth16VerificationFailed
    );
    require!(
        proof.public_inputs[3] == args.settlement_receipt_hash,
        LendingError::Groth16VerificationFailed
    );
    require!(
        proof.public_inputs[5] == args.receipt_binding_hash,
        LendingError::Groth16VerificationFailed
    );

    // Copy the first 6 signals from the 20-slot account array into a fixed-size local.
    let mut inputs_6 = [[0u8; 32]; 6];
    inputs_6.copy_from_slice(&proof.public_inputs[..6]);

    let ok = groth16_verifier::verify_repay_groth16(
        &proof.proof_a,
        &proof.proof_b,
        &proof.proof_c,
        &inputs_6,
    )
    .map_err(|_| error!(LendingError::Groth16VerificationFailed))?;
    require!(ok, LendingError::Groth16VerificationFailed);
    Ok(())
}

fn verify_private_payment_receipt(_args: &RepayArgs, _repayment_vault: Pubkey) -> Result<()> {
    err!(LendingError::PrivatePaymentVerifierNotWired)
}

fn verify_encrypt_reveal(_args: &LiquidationRevealArgs) -> Result<()> {
    // Official encrypt-anchor cannot currently cross this Anchor 0.32.1 boundary:
    // EncryptContext expects solana_account_info 3.1.x, while Anchor 0.32.1
    // provides 2.3.x AccountInfo. Keep liquidation reveals fail-closed until
    // a compatible Encrypt revision or fork is available.
    err!(LendingError::EncryptVerifierNotWired)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = InterestRateModel::SPACE,
        seeds = [b"interest-rate-model"],
        bump
    )]
    pub interest_model: Account<'info, InterestRateModel>,
    pub system_program: Program<'info, System>,
}

/// Context for store_collateral_proof and store_repay_proof.
/// proof_nonce is the PDA seed component; pass the same value to borrow/repay.
#[derive(Accounts)]
#[instruction(proof_nonce: [u8; 32])]
pub struct StoreLendingProof<'info> {
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
#[instruction(args: BorrowArgs)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = LoanAccount::SPACE,
        seeds = [b"loan", args.collateral_nullifier_hash.as_ref()],
        bump
    )]
    pub loan: Account<'info, LoanAccount>,
    #[account(seeds = [b"interest-rate-model"], bump = interest_model.bump)]
    pub interest_model: Account<'info, InterestRateModel>,
    #[account(
        mut,
        seeds = [b"nullifier", args.collateral_nullifier_hash.as_ref()],
        bump = nullifier.bump,
        seeds::program = nullifier_registry::ID
    )]
    pub nullifier: Account<'info, NullifierAccount>,
    #[account(
        seeds = [b"registry-config"],
        bump = registry_config.bump,
        seeds::program = nullifier_registry::ID
    )]
    pub registry_config: Account<'info, RegistryConfig>,
    /// CHECK: LendingPool registry-writer PDA; signed only through invoke_signed.
    #[account(seeds = [REGISTRY_WRITER_SEED], bump)]
    pub registry_writer: UncheckedAccount<'info>,
    pub nullifier_registry_program: Program<'info, NullifierRegistry>,
    pub system_program: Program<'info, System>,
    /// Collateral proof account written by store_collateral_proof; consumed after use.
    /// Box<Account> keeps the 940-byte ProofData on the heap, reducing the try_accounts
    /// stack frame below the 4096-byte BPF limit (B7 mitigation).
    #[account(
        mut,
        seeds = [PROOF_DATA_SEED, payer.key().as_ref(), args.proof_nonce.as_ref()],
        bump = proof_data.bump,
        constraint = proof_data.authority == payer.key() @ LendingError::ProofAccountOwnerMismatch,
        constraint = !proof_data.consumed @ LendingError::ProofAccountConsumed,
        constraint = proof_data.circuit_kind == LendingProofKind::Collateral @ LendingError::WrongProofKind,
    )]
    pub proof_data: Box<Account<'info, ProofData>>,
}

#[derive(Accounts)]
#[instruction(args: RepayArgs)]
pub struct Repay<'info> {
    pub relay: Signer<'info>,
    #[account(
        mut,
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
    #[account(
        mut,
        seeds = [b"nullifier", args.nullifier_hash.as_ref()],
        bump = nullifier.bump,
        seeds::program = nullifier_registry::ID
    )]
    pub nullifier: Account<'info, NullifierAccount>,
    #[account(
        seeds = [b"registry-config"],
        bump = registry_config.bump,
        seeds::program = nullifier_registry::ID
    )]
    pub registry_config: Account<'info, RegistryConfig>,
    /// CHECK: LendingPool registry-writer PDA; signed only through invoke_signed.
    #[account(seeds = [REGISTRY_WRITER_SEED], bump)]
    pub registry_writer: UncheckedAccount<'info>,
    pub nullifier_registry_program: Program<'info, NullifierRegistry>,
    /// Repay proof account written by store_repay_proof; consumed after use.
    /// Box<Account> keeps the 940-byte ProofData on the heap, reducing the try_accounts
    /// stack frame below the 4096-byte BPF limit (B7 mitigation).
    #[account(
        mut,
        seeds = [PROOF_DATA_SEED, relay.key().as_ref(), args.proof_nonce.as_ref()],
        bump = proof_data.bump,
        constraint = proof_data.authority == relay.key() @ LendingError::ProofAccountOwnerMismatch,
        constraint = !proof_data.consumed @ LendingError::ProofAccountConsumed,
        constraint = proof_data.circuit_kind == LendingProofKind::Repay @ LendingError::WrongProofKind,
    )]
    pub proof_data: Box<Account<'info, ProofData>>,
}

#[derive(Accounts)]
pub struct RequestLiquidationReveal<'info> {
    pub keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
}

#[derive(Accounts)]
pub struct VerifyLiquidationReveal<'info> {
    pub encrypt_keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
}

#[derive(Accounts)]
pub struct RequestEncryptLiquidationReveal<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
    /// CHECK: Decryption request account created by the Encrypt program.
    #[account(mut)]
    pub request_acct: UncheckedAccount<'info>,
    /// CHECK: Encrypt ciphertext account that represents the liquidatable boolean.
    pub ciphertext: UncheckedAccount<'info>,
    /// CHECK: Official Encrypt devnet program from the published docs/source.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config account.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit account.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: Encrypt CPI authority PDA for this program.
    #[account(seeds = [ENCRYPT_CPI_AUTHORITY_SEED], bump)]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Current program id account, passed through to Encrypt as the caller.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Active Encrypt network encryption key account.
    pub network_encryption_key: UncheckedAccount<'info>,
    /// CHECK: Encrypt event authority account.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyEncryptLiquidationReveal<'info> {
    pub encrypt_keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
    /// CHECK: Completed Encrypt decryption request account.
    pub request_acct: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub liquidator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
}

#[derive(Accounts)]
pub struct ApproveIkaBorrowMessage<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [b"loan", loan.collateral_nullifier_hash.as_ref()],
        bump = loan.bump
    )]
    pub loan: Account<'info, LoanAccount>,
    /// CHECK: IKA DWalletCoordinator PDA for the active epoch.
    pub coordinator: UncheckedAccount<'info>,
    /// CHECK: IKA MessageApproval PDA. Created by the IKA dWallet program.
    #[account(mut)]
    pub message_approval: UncheckedAccount<'info>,
    /// CHECK: IKA dWallet account. The dWallet authority must be this program's CPI authority PDA.
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: This lending_pool executable account is required by IKA's CPI authority verification.
    #[account(executable, address = crate::ID)]
    pub program: UncheckedAccount<'info>,
    /// CHECK: IKA CPI authority PDA derived from lending_pool with seed b"__ika_cpi_authority".
    #[account(seeds = [CPI_AUTHORITY_SEED], bump)]
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Official IKA pre-alpha dWallet program.
    #[account(address = IKA_DWALLET_PROGRAM_ID)]
    pub dwallet_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct InterestRateModel {
    pub authority: Pubkey,
    pub utilization_kinks: [u16; KINK_COUNT],
    pub rate_at_kink: [u16; KINK_COUNT],
    pub last_updated: i64,
    pub bump: u8,
}

impl InterestRateModel {
    pub const SPACE: usize = 8 + 32 + (KINK_COUNT * 2) + (KINK_COUNT * 2) + 8 + 1;
}

#[account]
pub struct LoanAccount {
    pub collateral_nullifier_hash: [u8; 32],
    pub collateral_denomination_class: u8,
    pub loan_id: u64,
    pub disbursed_at_slot: u64,
    pub borrow_amount: u64,
    pub borrow_bucket: u16,
    pub status: LoanStatus,
    pub is_liquidatable_handle: [u8; 32],
    pub liq_ciphertext_handle: [u8; 32],
    pub pending_liquidation_reveal: bool,
    pub confirmed_liquidatable: bool,
    pub consecutive_breach_count: u8,
    pub breach_first_slot: u64,
    pub future_sign_authorized: bool,
    pub last_accrual_slot: u64,
    pub interest_rate_bps: u64,
    pub latest_repayment_receipt_hash: [u8; 32],
    pub repayment_vault: Pubkey,
    pub bump: u8,
}

impl LoanAccount {
    pub const SPACE: usize =
        8 + 32 + 1 + 8 + 8 + 8 + 2 + 1 + 32 + 32 + 1 + 1 + 1 + 8 + 1 + 8 + 8 + 32 + 32 + 1;
}

/// Proof account for DEV/TEST Groth16 lending proofs (collateral or repay).
/// Written by store_collateral_proof / store_repay_proof; consumed by borrow / repay.
/// Space: ProofData::SPACE bytes.
#[account]
pub struct ProofData {
    pub authority: Pubkey,
    pub circuit_kind: LendingProofKind,
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
    /// Actual number of valid public signals stored (20 for collateral, 6 for repay).
    pub public_input_count: u8,
    /// Up to 20 public signals; only public_input_count slots are meaningful.
    pub public_inputs: [[u8; 32]; 20],
    pub consumed: bool,
    pub bump: u8,
}

impl ProofData {
    // discriminator(8) + authority(32) + circuit_kind(1) +
    // proof_a(64) + proof_b(128) + proof_c(64) + public_input_count(1) +
    // public_inputs(20*32=640) + consumed(1) + bump(1)
    pub const SPACE: usize = 8 + 32 + 1 + 64 + 128 + 64 + 1 + (20 * 32) + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum LendingProofKind {
    Collateral,
    Repay,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum LoanStatus {
    Active,
    Repaid,
    Liquidated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BorrowArgs {
    pub collateral_nullifier_hash: [u8; 32],
    pub collateral_denomination_class: u8,
    pub loan_id: u64,
    pub borrow_amount: u64,
    pub borrow_bucket: u16,
    pub interest_rate_bps: u64,
    pub repayment_vault: Pubkey,
    pub future_sign_authorized: bool,
    /// PDA nonce used to locate the collateral proof account written by store_collateral_proof.
    /// Compute budget: prepend ComputeBudgetProgram::set_compute_unit_limit(1_400_000).
    pub proof_nonce: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RepayArgs {
    pub nullifier_hash: [u8; 32],
    pub loan_id: u64,
    pub outstanding_balance: u64,
    pub settlement_receipt_hash: [u8; 32],
    pub receipt_binding_hash: [u8; 32],
    /// PDA nonce used to locate the repay proof account written by store_repay_proof.
    pub proof_nonce: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LiquidationRevealArgs {
    pub ciphertext_handle: [u8; 32],
    pub loan_pda: Pubkey,
    pub decrypted_liquidatable: bool,
    pub proof_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct IkaApproveMessageArgs {
    pub message_digest: [u8; 32],
    pub message_metadata_digest: [u8; 32],
    pub user_pubkey: [u8; 32],
    pub signature_scheme: u16,
    pub message_approval_bump: u8,
}

#[error_code]
pub enum LendingError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Borrow bucket is invalid")]
    InvalidBorrowBucket,
    #[msg("Interest rate is outside the configured model bounds")]
    InvalidInterestRate,
    #[msg("Repayment vault is invalid")]
    InvalidRepaymentVault,
    #[msg("Nullifier hash is invalid")]
    InvalidNullifierHash,
    #[msg("Proof public signal hash is invalid")]
    InvalidProofSignalHash,
    #[msg("Interest rate model is invalid")]
    InvalidRateModel,
    #[msg("Loan is not active")]
    LoanNotActive,
    #[msg("Nullifier hash does not match the loan collateral")]
    NullifierMismatch,
    #[msg("Repayment is less than accrued outstanding balance")]
    InsufficientRepayment,
    #[msg("Repayment outstanding balance does not match on-chain accrual")]
    OutstandingBalanceMismatch,
    #[msg("Groth16 verifier is not wired yet")]
    Groth16VerifierNotWired,
    #[msg("Groth16 proof verification failed")]
    Groth16VerificationFailed,
    #[msg("MagicBlock private payment verifier is not wired yet")]
    PrivatePaymentVerifierNotWired,
    #[msg("Encrypt FHE verifier is not wired yet")]
    EncryptVerifierNotWired,
    #[msg("Encrypt decryption request is not complete yet")]
    EncryptDecryptionNotReady,
    #[msg("Encrypt decryption request failed verification")]
    EncryptRevealVerificationFailed,
    #[msg("Ciphertext handle is invalid")]
    InvalidCiphertextHandle,
    #[msg("Ciphertext handle does not match the loan reveal request")]
    CiphertextHandleMismatch,
    #[msg("Liquidation reveal loan PDA does not match this loan account")]
    LoanPdaMismatch,
    #[msg("No liquidation reveal is pending")]
    LiquidationRevealNotPending,
    #[msg("IKA FutureSign authorization is missing")]
    FutureSignMissing,
    #[msg("Loan is not confirmed liquidatable")]
    NotLiquidatable,
    #[msg("Liquidation breach is not confirmed across enough epochs")]
    BreachNotConfirmed,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Proof account authority does not match signer")]
    ProofAccountOwnerMismatch,
    #[msg("Proof account has already been consumed")]
    ProofAccountConsumed,
    #[msg("Proof account is for the wrong circuit")]
    WrongProofKind,
    #[msg("IKA message digest is invalid")]
    InvalidIkaMessageDigest,
    #[msg("IKA user public key is invalid")]
    InvalidIkaUserPubkey,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_kinks() -> [u16; KINK_COUNT] {
        [
            0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000,
        ]
    }

    fn valid_rates() -> [u16; KINK_COUNT] {
        [
            0, 150, 300, 450, 600, 800, 1_100, 1_600, 2_400, 4_000, 8_000,
        ]
    }

    fn interest_model() -> InterestRateModel {
        InterestRateModel {
            authority: Pubkey::new_unique(),
            utilization_kinks: valid_kinks(),
            rate_at_kink: valid_rates(),
            last_updated: 0,
            bump: 255,
        }
    }

    fn loan() -> LoanAccount {
        LoanAccount {
            collateral_nullifier_hash: [3; 32],
            collateral_denomination_class: 1,
            loan_id: 42,
            disbursed_at_slot: 10,
            borrow_amount: 1_000_000_000,
            borrow_bucket: 5_000,
            status: LoanStatus::Active,
            is_liquidatable_handle: [0; 32],
            liq_ciphertext_handle: [0; 32],
            pending_liquidation_reveal: false,
            confirmed_liquidatable: false,
            consecutive_breach_count: 0,
            breach_first_slot: 0,
            future_sign_authorized: false,
            last_accrual_slot: 10,
            interest_rate_bps: 1_000,
            latest_repayment_receipt_hash: [0; 32],
            repayment_vault: Pubkey::new_unique(),
            bump: 255,
        }
    }

    fn make_collateral_proof_data(
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 20],
    ) -> ProofData {
        ProofData {
            authority: Pubkey::new_unique(),
            circuit_kind: LendingProofKind::Collateral,
            proof_a,
            proof_b,
            proof_c,
            public_input_count: 20,
            public_inputs,
            consumed: false,
            bump: 255,
        }
    }

    fn make_repay_proof_data(
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        sig6: [[u8; 32]; 6],
    ) -> ProofData {
        let mut public_inputs = [[0u8; 32]; 20];
        public_inputs[..6].copy_from_slice(&sig6);
        ProofData {
            authority: Pubkey::new_unique(),
            circuit_kind: LendingProofKind::Repay,
            proof_a,
            proof_b,
            proof_c,
            public_input_count: 6,
            public_inputs,
            consumed: false,
            bump: 255,
        }
    }

    fn build_encrypt_request_data_bool(
        ciphertext_handle: [u8; 32],
        ciphertext_digest: [u8; 32],
        bytes_written: u32,
        value: bool,
    ) -> Vec<u8> {
        let mut data =
            vec![0u8; encrypt_account_data::DR_HEADER_END + bytes_written.max(1) as usize];
        data[0] = 3;
        data[1] = 1;
        data[encrypt_account_data::DR_CIPHERTEXT..encrypt_account_data::DR_CIPHERTEXT + 32]
            .copy_from_slice(&ciphertext_handle);
        data[encrypt_account_data::DR_CIPHERTEXT_DIGEST
            ..encrypt_account_data::DR_CIPHERTEXT_DIGEST + 32]
            .copy_from_slice(&ciphertext_digest);
        data[encrypt_account_data::DR_FHE_TYPE] = 0;
        data[encrypt_account_data::DR_TOTAL_LEN..encrypt_account_data::DR_TOTAL_LEN + 4]
            .copy_from_slice(&1u32.to_le_bytes());
        data[encrypt_account_data::DR_BYTES_WRITTEN..encrypt_account_data::DR_BYTES_WRITTEN + 4]
            .copy_from_slice(&bytes_written.to_le_bytes());
        if bytes_written > 0 {
            data[encrypt_account_data::DR_HEADER_END] = u8::from(value);
        }
        data
    }

    fn base_borrow_args() -> BorrowArgs {
        BorrowArgs {
            collateral_nullifier_hash: [3; 32],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 500_000_000,
            borrow_bucket: 5_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        }
    }

    fn base_repay_args() -> RepayArgs {
        RepayArgs {
            nullifier_hash: [3; 32],
            loan_id: 42,
            outstanding_balance: 510_000_000,
            settlement_receipt_hash: [5; 32],
            receipt_binding_hash: [6; 32],
            proof_nonce: [1u8; 32],
        }
    }

    #[test]
    fn rate_model_requires_sorted_kinks_and_monotonic_rates() {
        assert!(validate_rate_model(&valid_kinks(), &valid_rates()).is_ok());

        let mut bad_kinks = valid_kinks();
        bad_kinks[3] = bad_kinks[2];
        assert!(validate_rate_model(&bad_kinks, &valid_rates()).is_err());

        let mut bad_rates = valid_rates();
        bad_rates[6] = bad_rates[5] - 1;
        assert!(validate_rate_model(&valid_kinks(), &bad_rates).is_err());
    }

    #[test]
    fn interest_accrual_is_slot_based_and_never_reduces_principal() {
        let loan = loan();
        let outstanding =
            accrue_outstanding_balance(&loan, loan.last_accrual_slot + 1_000_000).unwrap();
        assert!(outstanding > loan.borrow_amount);
    }

    #[test]
    fn interest_accrual_same_slot_returns_principal() {
        let loan = loan();
        let outstanding = accrue_outstanding_balance(&loan, loan.last_accrual_slot).unwrap();

        assert_eq!(outstanding, loan.borrow_amount);
    }

    #[test]
    fn borrow_args_reject_out_of_bounds_financial_inputs() {
        let model = interest_model();
        let mut args = base_borrow_args();

        assert!(validate_borrow_args(&args, &model).is_ok());

        args.borrow_amount = 0;
        assert!(validate_borrow_args(&args, &model).is_err());
        args.borrow_amount = 500_000_000;

        args.borrow_bucket = 10_001;
        assert!(validate_borrow_args(&args, &model).is_err());
        args.borrow_bucket = 5_000;

        args.interest_rate_bps = u64::from(model.rate_at_kink[KINK_COUNT - 1]) + 1;
        assert!(validate_borrow_args(&args, &model).is_err());
    }

    #[test]
    fn ika_approval_args_reject_zero_message_or_user_key() {
        let mut args = IkaApproveMessageArgs {
            message_digest: [1; 32],
            message_metadata_digest: [0; 32],
            user_pubkey: [2; 32],
            signature_scheme: 0,
            message_approval_bump: 255,
        };

        assert!(validate_ika_approval_args(&args).is_ok());

        args.message_digest = [0; 32];
        assert!(validate_ika_approval_args(&args).is_err());
        args.message_digest = [1; 32];

        args.user_pubkey = [0; 32];
        assert!(validate_ika_approval_args(&args).is_err());
    }

    #[test]
    fn liquidation_reveal_rejects_ciphertext_handle_mismatch() {
        let mut loan = loan();
        loan.pending_liquidation_reveal = true;
        loan.liq_ciphertext_handle = [8; 32];
        let loan_pda = Pubkey::new_unique();

        let args = LiquidationRevealArgs {
            ciphertext_handle: [9; 32],
            loan_pda,
            decrypted_liquidatable: true,
            proof_hash: [10; 32],
        };

        assert!(validate_liquidation_reveal_args(loan_pda, &loan, &args).is_err());
    }

    #[test]
    fn liquidation_reveal_rejects_wrong_loan_pda() {
        let mut loan = loan();
        loan.liq_ciphertext_handle = [8; 32];
        let args = LiquidationRevealArgs {
            ciphertext_handle: [8; 32],
            loan_pda: Pubkey::new_unique(),
            decrypted_liquidatable: true,
            proof_hash: [10; 32],
        };

        assert!(validate_liquidation_reveal_args(Pubkey::new_unique(), &loan, &args).is_err());
    }

    #[test]
    fn repay_resets_liquidation_state() {
        let mut loan = loan();
        loan.pending_liquidation_reveal = true;
        loan.confirmed_liquidatable = true;
        loan.consecutive_breach_count = 3;
        loan.breach_first_slot = 99;
        loan.liq_ciphertext_handle = [8; 32];
        loan.is_liquidatable_handle = [7; 32];

        reset_liquidation_state_after_repay(&mut loan);

        assert!(!loan.pending_liquidation_reveal);
        assert!(!loan.confirmed_liquidatable);
        assert_eq!(loan.consecutive_breach_count, 0);
        assert_eq!(loan.breach_first_slot, 0);
        assert_eq!(loan.liq_ciphertext_handle, [0; 32]);
        assert_eq!(loan.is_liquidatable_handle, [0; 32]);
    }

    #[test]
    fn unimplemented_verifiers_still_fail_closed() {
        let repay_args = base_repay_args();
        let reveal_args = LiquidationRevealArgs {
            ciphertext_handle: [8; 32],
            loan_pda: Pubkey::new_unique(),
            decrypted_liquidatable: true,
            proof_hash: [9; 32],
        };
        assert!(verify_private_payment_receipt(&repay_args, Pubkey::new_unique()).is_err());
        assert!(verify_encrypt_reveal(&reveal_args).is_err());
    }

    #[test]
    fn encrypt_liquidation_reveal_reads_verified_true() {
        let mut loan = loan();
        loan.liq_ciphertext_handle = [8; 32];
        loan.is_liquidatable_handle = [9; 32];

        let request_data = build_encrypt_request_data_bool(
            loan.liq_ciphertext_handle,
            loan.is_liquidatable_handle,
            1,
            true,
        );

        assert!(decode_encrypt_liquidation_reveal(&loan, &request_data).unwrap());
    }

    #[test]
    fn encrypt_liquidation_reveal_reads_verified_false() {
        let mut loan = loan();
        loan.liq_ciphertext_handle = [8; 32];
        loan.is_liquidatable_handle = [9; 32];

        let request_data = build_encrypt_request_data_bool(
            loan.liq_ciphertext_handle,
            loan.is_liquidatable_handle,
            1,
            false,
        );

        assert!(!decode_encrypt_liquidation_reveal(&loan, &request_data).unwrap());
    }

    #[test]
    fn encrypt_liquidation_reveal_rejects_digest_mismatch() {
        let mut loan = loan();
        loan.liq_ciphertext_handle = [8; 32];
        loan.is_liquidatable_handle = [9; 32];

        let request_data =
            build_encrypt_request_data_bool(loan.liq_ciphertext_handle, [7; 32], 1, true);

        assert!(decode_encrypt_liquidation_reveal(&loan, &request_data).is_err());
    }

    #[test]
    fn encrypt_liquidation_reveal_rejects_pending_request() {
        let mut loan = loan();
        loan.liq_ciphertext_handle = [8; 32];
        loan.is_liquidatable_handle = [9; 32];

        let request_data = build_encrypt_request_data_bool(
            loan.liq_ciphertext_handle,
            loan.is_liquidatable_handle,
            0,
            true,
        );

        assert!(decode_encrypt_liquidation_reveal(&loan, &request_data).is_err());
    }

    #[test]
    fn encrypt_liquidation_reveal_rejects_ciphertext_mismatch() {
        let mut loan = loan();
        loan.liq_ciphertext_handle = [8; 32];
        loan.is_liquidatable_handle = [9; 32];

        let request_data =
            build_encrypt_request_data_bool([7; 32], loan.is_liquidatable_handle, 1, true);

        assert!(decode_encrypt_liquidation_reveal(&loan, &request_data).is_err());
    }

    #[test]
    fn proof_data_space_constant_matches_struct_layout() {
        // discriminator(8) + authority(32) + circuit_kind(1) +
        // proof_a(64) + proof_b(128) + proof_c(64) + public_input_count(1) +
        // public_inputs(20*32=640) + consumed(1) + bump(1) = 940
        assert_eq!(ProofData::SPACE, 940);
    }

    #[test]
    fn store_lending_proof_stores_expected_payload() {
        use crate::groth16_verifier::tests::{
            COLLATERAL_SMOKE_PROOF_A, COLLATERAL_SMOKE_PROOF_B, COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        };
        let proof = make_collateral_proof_data(
            COLLATERAL_SMOKE_PROOF_A,
            COLLATERAL_SMOKE_PROOF_B,
            COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        assert_eq!(proof.circuit_kind, LendingProofKind::Collateral);
        assert_eq!(proof.public_input_count, 20);
        assert_eq!(proof.proof_a, COLLATERAL_SMOKE_PROOF_A);
        assert_eq!(proof.public_inputs, COLLATERAL_SMOKE_PUBLIC_SIGNALS);
        assert!(!proof.consumed);
    }

    #[test]
    fn collateral_proof_with_valid_smoke_vector_passes() {
        use crate::groth16_verifier::tests::{
            COLLATERAL_SMOKE_PROOF_A, COLLATERAL_SMOKE_PROOF_B, COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        };
        // smoke signal[18] = 50_000_000 (borrow_amount), signal[19] = 15_000 (borrow_bucket)
        let args = BorrowArgs {
            collateral_nullifier_hash: COLLATERAL_SMOKE_PUBLIC_SIGNALS[16],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 50_000_000,
            borrow_bucket: 15_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        };
        let proof = make_collateral_proof_data(
            COLLATERAL_SMOKE_PROOF_A,
            COLLATERAL_SMOKE_PROOF_B,
            COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_collateral_proof(&args, &proof).is_ok());
    }

    #[test]
    fn collateral_proof_with_empty_proof_fails() {
        use crate::groth16_verifier::tests::COLLATERAL_SMOKE_PUBLIC_SIGNALS;
        let args = BorrowArgs {
            collateral_nullifier_hash: COLLATERAL_SMOKE_PUBLIC_SIGNALS[16],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 50_000_000,
            borrow_bucket: 15_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        };
        let proof = make_collateral_proof_data(
            [0u8; 64],
            [0u8; 128],
            [0u8; 64],
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_collateral_proof(&args, &proof).is_err());
    }

    #[test]
    fn collateral_proof_with_mutated_proof_fails() {
        use crate::groth16_verifier::tests::{
            COLLATERAL_SMOKE_PROOF_A, COLLATERAL_SMOKE_PROOF_B, COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        };
        let mut bad_a = COLLATERAL_SMOKE_PROOF_A;
        bad_a[32] ^= 0xff;
        let args = BorrowArgs {
            collateral_nullifier_hash: COLLATERAL_SMOKE_PUBLIC_SIGNALS[16],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 50_000_000,
            borrow_bucket: 15_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        };
        let proof = make_collateral_proof_data(
            bad_a,
            COLLATERAL_SMOKE_PROOF_B,
            COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_collateral_proof(&args, &proof).is_err());
    }

    #[test]
    fn collateral_proof_with_mismatched_nullifier_fails() {
        use crate::groth16_verifier::tests::{
            COLLATERAL_SMOKE_PROOF_A, COLLATERAL_SMOKE_PROOF_B, COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        };
        // collateral_nullifier_hash disagrees with public_inputs[16]; caught by cross-check.
        let args = BorrowArgs {
            collateral_nullifier_hash: [0xde; 32],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 50_000_000,
            borrow_bucket: 15_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        };
        let proof = make_collateral_proof_data(
            COLLATERAL_SMOKE_PROOF_A,
            COLLATERAL_SMOKE_PROOF_B,
            COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_collateral_proof(&args, &proof).is_err());
    }

    #[test]
    fn collateral_proof_with_consumed_proof_fails() {
        use crate::groth16_verifier::tests::{
            COLLATERAL_SMOKE_PROOF_A, COLLATERAL_SMOKE_PROOF_B, COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        };
        let args = BorrowArgs {
            collateral_nullifier_hash: COLLATERAL_SMOKE_PUBLIC_SIGNALS[16],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 50_000_000,
            borrow_bucket: 15_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        };
        let mut proof = make_collateral_proof_data(
            COLLATERAL_SMOKE_PROOF_A,
            COLLATERAL_SMOKE_PROOF_B,
            COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        proof.consumed = true;
        assert!(verify_collateral_proof(&args, &proof).is_err());
    }

    #[test]
    fn collateral_proof_with_wrong_kind_fails() {
        use crate::groth16_verifier::tests::{
            COLLATERAL_SMOKE_PROOF_A, COLLATERAL_SMOKE_PROOF_B, COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        };
        let args = BorrowArgs {
            collateral_nullifier_hash: COLLATERAL_SMOKE_PUBLIC_SIGNALS[16],
            collateral_denomination_class: 1,
            loan_id: 42,
            borrow_amount: 50_000_000,
            borrow_bucket: 15_000,
            interest_rate_bps: 1_000,
            repayment_vault: Pubkey::new_unique(),
            future_sign_authorized: true,
            proof_nonce: [1u8; 32],
        };
        let mut proof = make_collateral_proof_data(
            COLLATERAL_SMOKE_PROOF_A,
            COLLATERAL_SMOKE_PROOF_B,
            COLLATERAL_SMOKE_PROOF_C,
            COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        );
        proof.circuit_kind = LendingProofKind::Repay; // wrong kind
        assert!(verify_collateral_proof(&args, &proof).is_err());
    }

    #[test]
    fn repay_proof_with_valid_smoke_vector_passes() {
        use crate::groth16_verifier::tests::{
            REPAY_SMOKE_PROOF_A, REPAY_SMOKE_PROOF_B, REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        };
        // smoke: signal[1]=42 (loan_id), signal[2]=50_000_000 (outstanding_balance)
        let args = RepayArgs {
            nullifier_hash: REPAY_SMOKE_PUBLIC_SIGNALS[0],
            loan_id: 42,
            outstanding_balance: 50_000_000,
            settlement_receipt_hash: REPAY_SMOKE_PUBLIC_SIGNALS[3],
            receipt_binding_hash: REPAY_SMOKE_PUBLIC_SIGNALS[5],
            proof_nonce: [1u8; 32],
        };
        let proof = make_repay_proof_data(
            REPAY_SMOKE_PROOF_A,
            REPAY_SMOKE_PROOF_B,
            REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_repay_proof(&args, &proof).is_ok());
    }

    #[test]
    fn repay_proof_with_empty_proof_fails() {
        use crate::groth16_verifier::tests::REPAY_SMOKE_PUBLIC_SIGNALS;
        let args = RepayArgs {
            nullifier_hash: REPAY_SMOKE_PUBLIC_SIGNALS[0],
            loan_id: 42,
            outstanding_balance: 50_000_000,
            settlement_receipt_hash: REPAY_SMOKE_PUBLIC_SIGNALS[3],
            receipt_binding_hash: REPAY_SMOKE_PUBLIC_SIGNALS[5],
            proof_nonce: [1u8; 32],
        };
        let proof =
            make_repay_proof_data([0u8; 64], [0u8; 128], [0u8; 64], REPAY_SMOKE_PUBLIC_SIGNALS);
        assert!(verify_repay_proof(&args, &proof).is_err());
    }

    #[test]
    fn repay_proof_with_mutated_proof_fails() {
        use crate::groth16_verifier::tests::{
            REPAY_SMOKE_PROOF_A, REPAY_SMOKE_PROOF_B, REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        };
        let mut bad_a = REPAY_SMOKE_PROOF_A;
        bad_a[32] ^= 0xff;
        let args = RepayArgs {
            nullifier_hash: REPAY_SMOKE_PUBLIC_SIGNALS[0],
            loan_id: 42,
            outstanding_balance: 50_000_000,
            settlement_receipt_hash: REPAY_SMOKE_PUBLIC_SIGNALS[3],
            receipt_binding_hash: REPAY_SMOKE_PUBLIC_SIGNALS[5],
            proof_nonce: [1u8; 32],
        };
        let proof = make_repay_proof_data(
            bad_a,
            REPAY_SMOKE_PROOF_B,
            REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_repay_proof(&args, &proof).is_err());
    }

    #[test]
    fn repay_proof_with_mismatched_nullifier_fails() {
        use crate::groth16_verifier::tests::{
            REPAY_SMOKE_PROOF_A, REPAY_SMOKE_PROOF_B, REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        };
        // args.nullifier_hash disagrees with public_inputs[0]; caught by cross-check.
        let args = RepayArgs {
            nullifier_hash: [0xde; 32],
            loan_id: 42,
            outstanding_balance: 50_000_000,
            settlement_receipt_hash: REPAY_SMOKE_PUBLIC_SIGNALS[3],
            receipt_binding_hash: REPAY_SMOKE_PUBLIC_SIGNALS[5],
            proof_nonce: [1u8; 32],
        };
        let proof = make_repay_proof_data(
            REPAY_SMOKE_PROOF_A,
            REPAY_SMOKE_PROOF_B,
            REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        );
        assert!(verify_repay_proof(&args, &proof).is_err());
    }

    #[test]
    fn repay_proof_with_consumed_proof_fails() {
        use crate::groth16_verifier::tests::{
            REPAY_SMOKE_PROOF_A, REPAY_SMOKE_PROOF_B, REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        };
        let args = RepayArgs {
            nullifier_hash: REPAY_SMOKE_PUBLIC_SIGNALS[0],
            loan_id: 42,
            outstanding_balance: 50_000_000,
            settlement_receipt_hash: REPAY_SMOKE_PUBLIC_SIGNALS[3],
            receipt_binding_hash: REPAY_SMOKE_PUBLIC_SIGNALS[5],
            proof_nonce: [1u8; 32],
        };
        let mut proof = make_repay_proof_data(
            REPAY_SMOKE_PROOF_A,
            REPAY_SMOKE_PROOF_B,
            REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        );
        proof.consumed = true;
        assert!(verify_repay_proof(&args, &proof).is_err());
    }

    #[test]
    fn repay_proof_with_wrong_kind_fails() {
        use crate::groth16_verifier::tests::{
            REPAY_SMOKE_PROOF_A, REPAY_SMOKE_PROOF_B, REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        };
        let args = RepayArgs {
            nullifier_hash: REPAY_SMOKE_PUBLIC_SIGNALS[0],
            loan_id: 42,
            outstanding_balance: 50_000_000,
            settlement_receipt_hash: REPAY_SMOKE_PUBLIC_SIGNALS[3],
            receipt_binding_hash: REPAY_SMOKE_PUBLIC_SIGNALS[5],
            proof_nonce: [1u8; 32],
        };
        let mut proof = make_repay_proof_data(
            REPAY_SMOKE_PROOF_A,
            REPAY_SMOKE_PROOF_B,
            REPAY_SMOKE_PROOF_C,
            REPAY_SMOKE_PUBLIC_SIGNALS,
        );
        proof.circuit_kind = LendingProofKind::Collateral; // wrong kind
        assert!(verify_repay_proof(&args, &proof).is_err());
    }
}
