// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice An oracle that validates the off-chain proof behind one escrow.
interface ISettlementOracle {
    /// @notice true once the off-chain proof for escrow `id` has been validated
    function isConfirmed(uint256 id) external view returns (bool);
}

/// @notice Chainlink AggregatorV3Interface subset used for the peg check.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ISettlementEscrow — non-custodial stablecoin settlement escrow ruled by the CROSSING law
interface ISettlementEscrow {
    enum State {
        None,
        Open,
        Held,
        Settled,
        Refunded
    }
    enum Verdict {
        Dismiss,
        Release,
        Refund
    }

    struct Terms {
        address payee;
        address token;
        uint128 amount;
        uint40 deadline; // unix seconds, > block.timestamp
        uint32 holdWindow; // seconds, > 0
        uint8 quorum; // 0..approvers.length
        address[] approvers; // <= 16, unique, non-zero
        address oracle; // 0 = no oracle required
        address priceFeed; // 0 = no peg check
        address arbiter; // 0 = no arbiter
        bytes32 termsHash; // hash of the off-chain invoice / contract
    }

    struct EscrowView {
        address payer;
        address payee;
        address token;
        uint128 amount;
        uint128 funded;
        uint40 deadline;
        uint32 holdWindow;
        uint40 heldUntil;
        uint8 quorum;
        uint8 approvalCount;
        uint16 approvals; // bitmap over approvers[]
        address[] approvers;
        address oracle;
        address priceFeed;
        address arbiter;
        bytes32 termsHash;
        State state;
        bool disputed;
        uint8 lastObs;
        uint8 lastAct;
    }

    event Opened(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        address token,
        uint128 amount,
        uint128 funded,
        uint40 deadline
    );
    event Approved(uint256 indexed id, address indexed approver, uint8 approvalCount, uint8 quorum);
    event Disputed(uint256 indexed id, address indexed by);
    event Ruled(uint256 indexed id, uint8 obs, uint8 act);
    event HeldFor(uint256 indexed id, uint40 heldUntil);
    event Resolved(uint256 indexed id, address indexed arbiter, Verdict verdict);
    event Settled(uint256 indexed id, address indexed to, uint128 amount);
    event Refunded(uint256 indexed id, address indexed to, uint128 amount);
    event ThrottleSet(uint128 cap, uint32 window);

    error NotPayer();
    error NotParty();
    error NotApprover();
    error NotArbiter();
    error AlreadyApproved();
    error AlreadyDisputed();
    error NotDisputed();
    error BadState();
    error HoldActive();
    error DeadlineNotPassed();
    error BadTerms(string reason);
    error ReservedAct();

    function open(Terms calldata t) external returns (uint256 id);
    function approve(uint256 id) external;
    function dispute(uint256 id) external;
    function rule(uint256 id) external returns (uint8 act);
    function resolve(uint256 id, Verdict v) external;
    function refund(uint256 id) external;

    function observe(uint256 id) external view returns (uint8 obs);
    function preview(uint256 id) external view returns (uint8 obs, uint8 act);
    function previewBatch(uint256[] calldata ids) external view returns (uint256 mask, uint8 act);
    function getEscrow(uint256 id) external view returns (EscrowView memory);
    function escrowCount() external view returns (uint256);

    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
    function setThrottle(uint128 cap, uint32 window) external;
    function throttle()
        external
        view
        returns (uint128 cap, uint32 window, uint128 windowVolume, uint40 windowStart);
    function PEG_BAND_BPS() external view returns (uint256);
    function FEED_HEARTBEAT() external view returns (uint256);
}
