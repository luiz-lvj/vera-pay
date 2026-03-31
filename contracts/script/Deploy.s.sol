// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/VeraPay.sol";

contract DeployVeraPay is Script {
    function run() external {
        address feeRecipient = vm.envAddress("PROTOCOL_FEE_RECIPIENT");
        uint256 feeBps = vm.envUint("PROTOCOL_FEE_BPS");

        vm.startBroadcast();
        VeraPay veraPay = new VeraPay(feeRecipient, feeBps);
        vm.stopBroadcast();

        console.log("VeraPay deployed to:", address(veraPay));
    }
}
