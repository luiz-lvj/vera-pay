import "EVM"

/// Makes the COA approve an EVM spender to transfer ERC20 tokens on its behalf.
/// This is needed so VeraPay can call transferFrom on the subscriber's tokens.
///
/// Parameters:
///   tokenAddress: the ERC20 token contract address (hex, no 0x prefix)
///   spenderAddress: the contract to approve (e.g., VeraPay address, hex, no 0x prefix)
///   amount: the amount to approve (as a UInt256 — use a large number for unlimited)
transaction(tokenAddress: String, spenderAddress: String, amount: UInt256) {
    prepare(signer: auth(BorrowValue) &Account) {
        let coa = signer.storage.borrow<auth(EVM.Call) &EVM.CadenceOwnedAccount>(from: /storage/evm)
            ?? panic("No COA found at /storage/evm. Run SetupCOA first.")

        let calldata = EVM.encodeABIWithSignature(
            "approve(address,uint256)",
            [EVM.addressFromString(spenderAddress), amount]
        )

        let result = coa.call(
            to: EVM.addressFromString(tokenAddress),
            data: calldata,
            gasLimit: 100_000,
            value: EVM.Balance(attoflow: 0)
        )

        assert(result.status == EVM.Status.successful, message: "ERC20 approve failed")

        log("Approved ".concat(spenderAddress).concat(" to spend tokens on COA's behalf"))
    }
}
