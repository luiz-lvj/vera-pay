import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "FlowToken"
import "FungibleToken"

/// Cancels a scheduled payment and deposits the partial fee refund.
///
/// Parameters:
///   transactionId: the scheduled transaction ID returned when scheduling
transaction(transactionId: UInt64) {
    prepare(signer: auth(BorrowValue) &Account) {
        let manager = signer.storage.borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) ?? panic("Could not borrow Manager")

        let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FlowToken vault")

        let refund <- manager.cancel(id: transactionId)
        vault.deposit(from: <-refund)

        log("Cancelled scheduled transaction #".concat(transactionId.toString()))
    }
}
