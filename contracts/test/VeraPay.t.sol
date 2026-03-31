// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/VeraPay.sol";
import "../src/mocks/MockERC20.sol";

contract VeraPayTest is Test {
    VeraPay public veraPay;
    MockERC20 public usdc;

    address public owner = makeAddr("owner");
    address public feeRecipient = makeAddr("feeRecipient");
    address public merchant = makeAddr("merchant");
    address public subscriber = makeAddr("subscriber");
    address public keeper = makeAddr("keeper");

    uint256 constant FEE_BPS = 50; // 0.5 %
    uint256 constant PLAN_AMOUNT = 10e6; // 10 USDC (6 decimals)
    uint256 constant PLAN_INTERVAL = 30 days;

    function setUp() public {
        vm.startPrank(owner);
        veraPay = new VeraPay(feeRecipient, FEE_BPS);
        vm.stopPrank();

        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(subscriber, 1000e6);

        vm.prank(subscriber);
        usdc.approve(address(veraPay), type(uint256).max);
    }

    // ── Plan creation ────────────────────────────────────────────────────

    function test_createPlan() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Pro Plan", "ipfs://Qm..."
        );

        VeraPay.Plan memory plan = veraPay.getPlan(planId);
        assertEq(plan.merchant, merchant);
        assertEq(plan.amount, PLAN_AMOUNT);
        assertEq(plan.interval, PLAN_INTERVAL);
        assertTrue(plan.active);
    }

    function test_createPlan_revertsZeroAmount() public {
        vm.prank(merchant);
        vm.expectRevert("VeraPay: zero amount");
        veraPay.createPlan(address(usdc), 0, PLAN_INTERVAL, "Bad", "");
    }

    function test_createPlan_revertsShortInterval() public {
        vm.prank(merchant);
        vm.expectRevert("VeraPay: interval too short");
        veraPay.createPlan(address(usdc), PLAN_AMOUNT, 10 minutes, "Bad", "");
    }

    function test_togglePlan() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Toggle", ""
        );

        vm.prank(merchant);
        veraPay.togglePlan(planId);
        assertFalse(veraPay.getPlan(planId).active);

        vm.prank(merchant);
        veraPay.togglePlan(planId);
        assertTrue(veraPay.getPlan(planId).active);
    }

    // ── Subscription ─────────────────────────────────────────────────────

    function test_subscribe() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Sub Plan", ""
        );

        uint256 balBefore = usdc.balanceOf(subscriber);

        vm.prank(subscriber);
        uint256 subId = veraPay.subscribe(planId);

        VeraPay.Subscription memory sub = veraPay.getSubscription(subId);
        assertEq(sub.subscriber, subscriber);
        assertEq(sub.paymentsCount, 1);
        assertTrue(sub.active);

        uint256 fee = (PLAN_AMOUNT * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(subscriber), balBefore - PLAN_AMOUNT);
        assertEq(usdc.balanceOf(merchant), PLAN_AMOUNT - fee);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    function test_subscribe_revertsInactivePlan() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Disabled", ""
        );
        vm.prank(merchant);
        veraPay.togglePlan(planId);

        vm.prank(subscriber);
        vm.expectRevert("VeraPay: plan inactive");
        veraPay.subscribe(planId);
    }

    function test_subscribe_revertsDuplicate() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Dup", ""
        );

        vm.prank(subscriber);
        veraPay.subscribe(planId);

        vm.prank(subscriber);
        vm.expectRevert("VeraPay: already subscribed");
        veraPay.subscribe(planId);
    }

    // ── Payment processing ───────────────────────────────────────────────

    function test_processPayment() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Monthly", ""
        );

        vm.prank(subscriber);
        uint256 subId = veraPay.subscribe(planId);

        assertFalse(veraPay.isPaymentDue(subId));

        vm.warp(block.timestamp + PLAN_INTERVAL);
        assertTrue(veraPay.isPaymentDue(subId));

        uint256 merchantBefore = usdc.balanceOf(merchant);

        vm.prank(keeper);
        veraPay.processPayment(subId);

        uint256 fee = (PLAN_AMOUNT * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(merchant), merchantBefore + PLAN_AMOUNT - fee);
        assertEq(veraPay.getSubscription(subId).paymentsCount, 2);
        assertFalse(veraPay.isPaymentDue(subId));
    }

    function test_processPayment_revertsNotDue() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "NotDue", ""
        );

        vm.prank(subscriber);
        uint256 subId = veraPay.subscribe(planId);

        vm.prank(keeper);
        vm.expectRevert("VeraPay: not due");
        veraPay.processPayment(subId);
    }

    function test_batchProcessPayments() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Batch", ""
        );

        address sub2 = makeAddr("sub2");
        usdc.mint(sub2, 1000e6);
        vm.prank(sub2);
        usdc.approve(address(veraPay), type(uint256).max);

        vm.prank(subscriber);
        uint256 subId1 = veraPay.subscribe(planId);
        vm.prank(sub2);
        uint256 subId2 = veraPay.subscribe(planId);

        vm.warp(block.timestamp + PLAN_INTERVAL);

        uint256[] memory ids = new uint256[](2);
        ids[0] = subId1;
        ids[1] = subId2;

        vm.prank(keeper);
        veraPay.batchProcessPayments(ids);

        assertEq(veraPay.getSubscription(subId1).paymentsCount, 2);
        assertEq(veraPay.getSubscription(subId2).paymentsCount, 2);
    }

    // ── Cancellation ─────────────────────────────────────────────────────

    function test_cancelSubscription_bySubscriber() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Cancel", ""
        );

        vm.prank(subscriber);
        uint256 subId = veraPay.subscribe(planId);

        vm.prank(subscriber);
        veraPay.cancelSubscription(subId);
        assertFalse(veraPay.getSubscription(subId).active);
    }

    function test_cancelSubscription_byMerchant() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Cancel", ""
        );

        vm.prank(subscriber);
        uint256 subId = veraPay.subscribe(planId);

        vm.prank(merchant);
        veraPay.cancelSubscription(subId);
        assertFalse(veraPay.getSubscription(subId).active);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    function test_setProtocolFee() public {
        vm.prank(owner);
        veraPay.setProtocolFee(100);
        assertEq(veraPay.protocolFeeBps(), 100);
    }

    function test_setProtocolFee_revertsTooHigh() public {
        vm.prank(owner);
        vm.expectRevert("VeraPay: fee > 10%");
        veraPay.setProtocolFee(1001);
    }

    function test_transferOwnership() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        veraPay.transferOwnership(newOwner);
        assertEq(veraPay.owner(), newOwner);
    }

    // ── View helpers ─────────────────────────────────────────────────────

    function test_getDuePayments() public {
        vm.prank(merchant);
        uint256 planId = veraPay.createPlan(
            address(usdc), PLAN_AMOUNT, PLAN_INTERVAL, "Due", ""
        );

        vm.prank(subscriber);
        uint256 subId = veraPay.subscribe(planId);

        uint256[] memory ids = new uint256[](1);
        ids[0] = subId;

        uint256[] memory due = veraPay.getDuePayments(ids);
        assertEq(due.length, 0);

        vm.warp(block.timestamp + PLAN_INTERVAL);
        due = veraPay.getDuePayments(ids);
        assertEq(due.length, 1);
        assertEq(due[0], subId);
    }
}
