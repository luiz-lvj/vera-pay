import "EVM"
import "FlowToken"
import "FungibleToken"

/// Creates a Cadence Owned Account (COA) and funds it with FLOW for EVM gas.
/// The COA is stored at /storage/evm and a public capability is published.
/// Run once per account that needs to call EVM contracts.
transaction(fundAmount: UFix64) {
    prepare(signer: auth(BorrowValue, SaveValue, IssueStorageCapabilityController, PublishCapability) &Account) {
        if signer.storage.borrow<&EVM.CadenceOwnedAccount>(from: /storage/evm) != nil {
            log("COA already exists at /storage/evm")
            return
        }

        let coa <- EVM.createCadenceOwnedAccount()

        if fundAmount > 0.0 {
            let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Could not borrow FlowToken vault")

            let tokens <- vault.withdraw(amount: fundAmount) as! @FlowToken.Vault
            coa.deposit(from: <-tokens)
        }

        signer.storage.save(<-coa, to: /storage/evm)

        let callCap = signer.capabilities.storage.issue<auth(EVM.Call) &EVM.CadenceOwnedAccount>(/storage/evm)
        let publicCap = signer.capabilities.storage.issue<&EVM.CadenceOwnedAccount>(/storage/evm)
        signer.capabilities.publish(publicCap, at: /public/evm)

        log("COA created and funded with ".concat(fundAmount.toString()).concat(" FLOW"))
    }
}
