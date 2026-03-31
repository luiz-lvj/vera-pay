// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/mocks/MockERC20.sol";

contract DeployERC20 is Script {
    function run() external {
        string memory name = vm.envString("NAME");
        string memory symbol = vm.envString("SYMBOL");

        vm.startBroadcast();
        MockERC20 mockERC20 = new MockERC20(name, symbol, 18);
        vm.stopBroadcast();

        console.log("MockERC20 deployed to:", address(mockERC20));
    }
}
