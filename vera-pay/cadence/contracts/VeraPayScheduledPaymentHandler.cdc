import "FlowTransactionScheduler"
import "EVM"
import "MetadataViews"

/// Cadence contract that implements FlowTransactionScheduler.TransactionHandler
/// to autonomously call processPayment(uint256) on the EVM VeraPay contract
/// via a Cadence Owned Account (COA).
access(all) contract VeraPayScheduledPaymentHandler {

    access(all) let HandlerStoragePath: StoragePath
    access(all) let HandlerPublicPath: PublicPath

    access(all) event PaymentExecuted(subscriptionId: UInt256, evmContractAddress: String, success: Bool)
    access(all) event PaymentFailed(subscriptionId: UInt256, reason: String)

    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        /// Reference to the COA that will call the EVM contract
        access(self) var coaCapability: Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount>

        /// The VeraPay EVM contract address (20 bytes)
        access(all) let verapayAddress: EVM.EVMAddress

        init(
            coaCapability: Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount>,
            verapayAddress: EVM.EVMAddress
        ) {
            self.coaCapability = coaCapability
            self.verapayAddress = verapayAddress
        }

        /// Called by the Flow protocol at the scheduled time.
        /// `data` is expected to be a UInt256 subscription ID.
        access(FlowTransactionScheduler.Execute)
        fun executeTransaction(id: UInt64, data: AnyStruct?) {
            let subscriptionId = data as? UInt256
                ?? panic("VeraPay handler expects data to be a UInt256 subscription ID")

            let coa = self.coaCapability.borrow()
                ?? panic("Could not borrow COA capability")

            let calldata = EVM.encodeABIWithSignature(
                "processPayment(uint256)",
                [subscriptionId]
            )

            let result = coa.call(
                to: self.verapayAddress,
                data: calldata,
                gasLimit: 300_000,
                value: EVM.Balance(attoflow: 0)
            )

            if result.status == EVM.Status.successful {
                emit PaymentExecuted(
                    subscriptionId: subscriptionId,
                    evmContractAddress: self.verapayAddress.toString(),
                    success: true
                )
            } else {
                emit PaymentFailed(
                    subscriptionId: subscriptionId,
                    reason: String.fromUTF8(result.data) ?? "EVM call reverted"
                )
            }
        }

        access(all) view fun getViews(): [Type] {
            return [
                Type<StoragePath>(),
                Type<PublicPath>(),
                Type<MetadataViews.Display>()
            ]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return VeraPayScheduledPaymentHandler.HandlerStoragePath
                case Type<PublicPath>():
                    return VeraPayScheduledPaymentHandler.HandlerPublicPath
                case Type<MetadataViews.Display>():
                    return MetadataViews.Display(
                        name: "VeraPay Scheduled Payment Handler",
                        description: "Calls processPayment(uint256) on the VeraPay EVM contract at scheduled times",
                        thumbnail: MetadataViews.HTTPFile(url: "")
                    )
                default:
                    return nil
            }
        }
    }

    access(all) fun createHandler(
        coaCapability: Capability<auth(EVM.Call) &EVM.CadenceOwnedAccount>,
        verapayAddress: EVM.EVMAddress
    ): @Handler {
        return <- create Handler(
            coaCapability: coaCapability,
            verapayAddress: verapayAddress
        )
    }

    init() {
        self.HandlerStoragePath = /storage/VeraPayScheduledPaymentHandler
        self.HandlerPublicPath = /public/VeraPayScheduledPaymentHandler
    }
}
