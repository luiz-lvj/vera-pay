import "VeraPayScheduledPaymentHandler"
import "FlowTransactionScheduler"
import "EVM"

/// Initializes the VeraPay scheduled payment handler resource.
/// Must be run after SetupCOA.cdc so that a COA exists at /storage/evm.
///
/// Parameters:
///   verapayEvmAddress: hex string of the VeraPay contract on Flow EVM (without 0x prefix)
transaction(verapayEvmAddress: String) {
    prepare(signer: auth(BorrowValue, SaveValue, IssueStorageCapabilityController, PublishCapability, GetStorageCapabilityController) &Account) {
        if signer.storage.borrow<&AnyResource>(from: /storage/VeraPayScheduledPaymentHandler) != nil {
            log("VeraPay handler already exists")
            return
        }

        let evmAddr = EVM.addressFromString(verapayEvmAddress)

        // Get the COA capability with Call entitlement
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

        log("VeraPay handler initialized for contract: ".concat(verapayEvmAddress))
    }
}
