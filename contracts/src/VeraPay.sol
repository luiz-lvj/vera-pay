// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VeraPay — On-chain subscription payments on Flow EVM
/// @notice Merchants create plans; subscribers approve ERC-20 spending and the
///         contract (or any keeper) pulls payments on schedule.
contract VeraPay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Structs ──────────────────────────────────────────────────────────

    struct Plan {
        address merchant;
        address paymentToken;
        uint256 amount;
        uint256 interval;
        string name;
        string metadataURI; // IPFS CID for off-chain metadata
        bool active;
    }

    struct Subscription {
        uint256 planId;
        address subscriber;
        uint256 startTime;
        uint256 lastPaymentTime;
        uint256 paymentsCount;
        bool active;
    }

    // ── State ────────────────────────────────────────────────────────────

    uint256 public nextPlanId;
    uint256 public nextSubscriptionId = 1; // start at 1 so 0 means "none"

    mapping(uint256 => Plan) public plans;
    mapping(uint256 => Subscription) public subscriptions;

    mapping(address => uint256[]) internal _merchantPlans;
    mapping(address => uint256[]) internal _subscriberSubs;
    mapping(uint256 planId => mapping(address subscriber => uint256 subId)) public activeSub;

    uint256 public protocolFeeBps;
    address public protocolFeeRecipient;
    address public owner;

    // ── Events ───────────────────────────────────────────────────────────

    event PlanCreated(
        uint256 indexed planId,
        address indexed merchant,
        address paymentToken,
        uint256 amount,
        uint256 interval,
        string name,
        string metadataURI
    );
    event PlanToggled(uint256 indexed planId, bool active);
    event Subscribed(uint256 indexed subscriptionId, uint256 indexed planId, address indexed subscriber);
    event PaymentProcessed(
        uint256 indexed subscriptionId,
        uint256 indexed planId,
        address indexed subscriber,
        address merchant,
        uint256 amount,
        uint256 protocolFee,
        uint256 timestamp
    );
    event SubscriptionCancelled(uint256 indexed subscriptionId, address indexed subscriber);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "VeraPay: not owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address _feeRecipient, uint256 _feeBps) {
        require(_feeRecipient != address(0), "VeraPay: zero address");
        require(_feeBps <= 1000, "VeraPay: fee > 10%");
        owner = msg.sender;
        protocolFeeRecipient = _feeRecipient;
        protocolFeeBps = _feeBps;
    }

    // ── Merchant functions ───────────────────────────────────────────────

    function createPlan(
        address _paymentToken,
        uint256 _amount,
        uint256 _interval,
        string calldata _name,
        string calldata _metadataURI
    ) external returns (uint256 planId) {
        require(_paymentToken != address(0), "VeraPay: zero token");
        require(_amount > 0, "VeraPay: zero amount");
        require(_interval >= 15 seconds, "VeraPay: interval too short");

        planId = nextPlanId++;
        plans[planId] = Plan({
            merchant: msg.sender,
            paymentToken: _paymentToken,
            amount: _amount,
            interval: _interval,
            name: _name,
            metadataURI: _metadataURI,
            active: true
        });
        _merchantPlans[msg.sender].push(planId);

        emit PlanCreated(planId, msg.sender, _paymentToken, _amount, _interval, _name, _metadataURI);
    }

    function togglePlan(uint256 _planId) external {
        require(plans[_planId].merchant == msg.sender, "VeraPay: not plan owner");
        plans[_planId].active = !plans[_planId].active;
        emit PlanToggled(_planId, plans[_planId].active);
    }

    // ── Subscriber functions ─────────────────────────────────────────────

    /// @notice Subscribe to a plan. The first payment is taken immediately.
    ///         Caller must have approved this contract for at least `plan.amount`.
    function subscribe(uint256 _planId) external nonReentrant returns (uint256 subId) {
        Plan memory plan = plans[_planId];
        require(plan.active, "VeraPay: plan inactive");

        uint256 existingSub = activeSub[_planId][msg.sender];
        require(existingSub == 0 || !subscriptions[existingSub].active, "VeraPay: already subscribed");

        subId = nextSubscriptionId++;
        subscriptions[subId] = Subscription({
            planId: _planId,
            subscriber: msg.sender,
            startTime: block.timestamp,
            lastPaymentTime: block.timestamp,
            paymentsCount: 1,
            active: true
        });
        _subscriberSubs[msg.sender].push(subId);
        activeSub[_planId][msg.sender] = subId;

        uint256 fee = _pullPayment(plan.paymentToken, msg.sender, plan.merchant, plan.amount);

        emit Subscribed(subId, _planId, msg.sender);
        emit PaymentProcessed(subId, _planId, msg.sender, plan.merchant, plan.amount, fee, block.timestamp);
    }

    function cancelSubscription(uint256 _subId) external {
        Subscription storage sub = subscriptions[_subId];
        require(
            sub.subscriber == msg.sender || plans[sub.planId].merchant == msg.sender,
            "VeraPay: not authorized"
        );
        require(sub.active, "VeraPay: already cancelled");

        sub.active = false;
        emit SubscriptionCancelled(_subId, sub.subscriber);
    }

    // ── Keeper / relayer function ────────────────────────────────────────

    /// @notice Pull a due payment for any active subscription. Can be called
    ///         by anyone (keeper, relayer, or the subscriber themselves).
    function processPayment(uint256 _subId) external nonReentrant {
        Subscription storage sub = subscriptions[_subId];
        require(sub.active, "VeraPay: sub inactive");

        Plan memory plan = plans[sub.planId];
        require(plan.active, "VeraPay: plan inactive");
        require(block.timestamp >= sub.lastPaymentTime + plan.interval, "VeraPay: not due");

        sub.lastPaymentTime = block.timestamp;
        sub.paymentsCount++;

        uint256 fee = _pullPayment(plan.paymentToken, sub.subscriber, plan.merchant, plan.amount);

        emit PaymentProcessed(_subId, sub.planId, sub.subscriber, plan.merchant, plan.amount, fee, block.timestamp);
    }

    /// @notice Process multiple due payments in a single transaction.
    function batchProcessPayments(uint256[] calldata _subIds) external nonReentrant {
        for (uint256 i = 0; i < _subIds.length; i++) {
            Subscription storage sub = subscriptions[_subIds[i]];
            if (!sub.active) continue;

            Plan memory plan = plans[sub.planId];
            if (!plan.active) continue;
            if (block.timestamp < sub.lastPaymentTime + plan.interval) continue;

            sub.lastPaymentTime = block.timestamp;
            sub.paymentsCount++;

            uint256 fee = _pullPayment(plan.paymentToken, sub.subscriber, plan.merchant, plan.amount);

            emit PaymentProcessed(
                _subIds[i], sub.planId, sub.subscriber, plan.merchant, plan.amount, fee, block.timestamp
            );
        }
    }

    // ── Admin functions ──────────────────────────────────────────────────

    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "VeraPay: fee > 10%");
        protocolFeeBps = _feeBps;
        emit ProtocolFeeUpdated(_feeBps);
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "VeraPay: zero address");
        protocolFeeRecipient = _recipient;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "VeraPay: zero address");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    // ── View helpers ─────────────────────────────────────────────────────

    function getPlan(uint256 _planId) external view returns (Plan memory) {
        return plans[_planId];
    }

    function getSubscription(uint256 _subId) external view returns (Subscription memory) {
        return subscriptions[_subId];
    }

    function getMerchantPlans(address _merchant) external view returns (uint256[] memory) {
        return _merchantPlans[_merchant];
    }

    function getSubscriberSubscriptions(address _subscriber) external view returns (uint256[] memory) {
        return _subscriberSubs[_subscriber];
    }

    function isPaymentDue(uint256 _subId) external view returns (bool) {
        Subscription memory sub = subscriptions[_subId];
        if (!sub.active) return false;
        Plan memory plan = plans[sub.planId];
        if (!plan.active) return false;
        return block.timestamp >= sub.lastPaymentTime + plan.interval;
    }

    function getDuePayments(uint256[] calldata _subIds) external view returns (uint256[] memory due) {
        uint256 count;
        for (uint256 i = 0; i < _subIds.length; i++) {
            Subscription memory sub = subscriptions[_subIds[i]];
            if (!sub.active) continue;
            Plan memory plan = plans[sub.planId];
            if (!plan.active) continue;
            if (block.timestamp >= sub.lastPaymentTime + plan.interval) count++;
        }

        due = new uint256[](count);
        uint256 idx;
        for (uint256 i = 0; i < _subIds.length; i++) {
            Subscription memory sub = subscriptions[_subIds[i]];
            if (!sub.active) continue;
            Plan memory plan = plans[sub.planId];
            if (!plan.active) continue;
            if (block.timestamp >= sub.lastPaymentTime + plan.interval) {
                due[idx++] = _subIds[i];
            }
        }
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _pullPayment(address token, address from, address merchant, uint256 amount)
        internal
        returns (uint256 fee)
    {
        IERC20 t = IERC20(token);
        fee = (amount * protocolFeeBps) / 10_000;
        uint256 merchantAmount = amount - fee;

        t.safeTransferFrom(from, merchant, merchantAmount);
        if (fee > 0) {
            t.safeTransferFrom(from, protocolFeeRecipient, fee);
        }
    }
}
