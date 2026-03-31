import "VeraPayScheduledPaymentHandler"
import "FlowTransactionScheduler"
import "EVM"

/// Removes an existing VeraPay handler (if any) and creates a new one
/// pointing to the given EVM contract address.
/// Use this after redeploying the VeraPay EVM contract.
///
/// Parameters:
///   verapayEvmAddress: hex string of the NEW VeraPay contract on Flow EVM (with 0x prefix)
transaction(verapayEvmAddress: String) {
    prepare(signer: auth(BorrowValue, SaveValue, LoadValue, IssueStorageCapabilityController, PublishCapability, UnpublishCapability, GetStorageCapabilityController) &Account) {
        // 1. Destroy old handler resource
        if let oldHandler <- signer.storage.load<@AnyResource>(from: /storage/VeraPayScheduledPaymentHandler) {
            destroy oldHandler
            log("Destroyed old VeraPay handler")
        }

        // 2. Unpublish old public capability
        signer.capabilities.unpublish(/public/VeraPayScheduledPaymentHandler)

        // 3. Delete ALL old capability controllers for this path
        let oldControllers = signer.capabilities.storage.getControllers(forPath: /storage/VeraPayScheduledPaymentHandler)
        for controller in oldControllers {
            controller.delete()
        }
        log("Deleted ".concat(oldControllers.length.toString()).concat(" old capability controllers"))

        let evmAddr = EVM.addressFromString(verapayEvmAddress)

        // Get or issue COA capability
        var coaCap: Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount>? = nil
        let controllers = signer.capabilities.storage.getControllers(forPath: /storage/evm)
        for controller in controllers {
            if let cap = controller.capability as? Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount> {
                coaCap = cap
                break
            }
        }

        if coaCap == nil {
            coaCap = signer.capabilities.storage.issue<auth(EVM.Call) &EVM.CadenceOwnedAccount>(/storage/evm)
        }

        let handler <- VeraPayScheduledPaymentHandler.createHandler(
            coaCapability: coaCap!,
            verapayAddress: evmAddr
        )
        signer.storage.save(<-handler, to: /storage/VeraPayScheduledPaymentHandler)

        // Issue execute capability for the scheduler
        signer.capabilities.storage.issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
            /storage/VeraPayScheduledPaymentHandler
        )

        let publicCap = signer.capabilities.storage.issue<&{FlowTransactionScheduler.TransactionHandler}>(
            /storage/VeraPayScheduledPaymentHandler
        )
        signer.capabilities.publish(publicCap, at: /public/VeraPayScheduledPaymentHandler)

        log("VeraPay handler re-initialized for contract: ".concat(verapayEvmAddress))
    }
}
