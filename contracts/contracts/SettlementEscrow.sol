// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISettlementEscrow, ISettlementOracle, IAggregatorV3} from "./interfaces/ISettlementEscrow.sol";
import {CrossingLaw} from "./CrossingLaw.sol";

/// @title SettlementEscrow — non-custodial stablecoin settlement escrow ruled by the CROSSING law
/// @notice Funds locked by a payer for a payee cross only when the law rules SETTLE on the
///         measured situation byte. No role can move funds anywhere but to the payee or the
///         payer, and only through: the law (SETTLE), the arbiter during a Held window, the
///         payer's deadline refund, or the payee's cancel. The guardian can only pause and
///         throttle, which merely raise hazard bits; it can never block a refund.
///
///         The MEASUREMENT (observe) is where policy lives; the LAW (CrossingLaw) is where
///         the decision lives. Every measurement that cannot complete SETS its hazard.
contract SettlementEscrow is ISettlementEscrow, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- storage
    struct Escrow {
        // slot 0
        address payer; // 20
        uint40 deadline; // 5
        uint40 heldUntil; // 5
        State state; // 1
        uint8 quorum; // 1
        // slot 1
        address payee; // 20
        uint32 holdWindow; // 4
        uint16 approvals; // 2  bitmap over approvers[]
        uint8 approvalCount; // 1
        bool disputed; // 1
        uint8 lastObs; // 1
        uint8 lastAct; // 1
        // slot 2
        address token;
        // slot 3
        uint128 amount;
        uint128 funded;
        // slots 4..6
        address oracle;
        address priceFeed;
        address arbiter;
        // slot 7
        bytes32 termsHash;
        // dynamic
        address[] approvers;
    }

    struct Throttle {
        uint128 cap; // 0 = throttle off
        uint32 window; // seconds; 0 = per-crossing cap only
        uint40 windowStart;
        uint128 windowVolume;
    }

    uint256 public immutable PEG_BAND_BPS;
    uint256 public immutable FEED_HEARTBEAT;

    uint256 internal constant MEASURE_GAS = 100_000; // gas cap on every external measurement
    uint256 internal constant MAX_APPROVERS = 16;

    uint256 private _count;
    mapping(uint256 id => Escrow) private _escrows;
    Throttle private _throttle;

    // ------------------------------------------------------------ constructor
    constructor(address guardian, uint256 pegBandBps, uint256 feedHeartbeat) Ownable(guardian) {
        if (pegBandBps == 0 || pegBandBps > 10_000) revert BadTerms("pegBand");
        if (feedHeartbeat == 0) revert BadTerms("heartbeat");
        PEG_BAND_BPS = pegBandBps;
        FEED_HEARTBEAT = feedHeartbeat;
    }

    // -------------------------------------------------------------- lifecycle
    /// @inheritdoc ISettlementEscrow
    function open(Terms calldata t) external whenNotPaused nonReentrant returns (uint256 id) {
        _validateTerms(t);
        id = ++_count;
        Escrow storage e = _escrows[id];
        e.payer = msg.sender;
        e.payee = t.payee;
        e.token = t.token;
        e.amount = t.amount;
        e.deadline = t.deadline;
        e.holdWindow = t.holdWindow;
        e.quorum = t.quorum;
        e.oracle = t.oracle;
        e.priceFeed = t.priceFeed;
        e.arbiter = t.arbiter;
        e.termsHash = t.termsHash;
        e.approvers = t.approvers;
        e.state = State.Open;

        // interaction last; the funded amount is MEASURED, not assumed (fee-on-transfer safe)
        IERC20 token = IERC20(t.token);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), t.amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received > type(uint128).max) received = type(uint128).max;
        e.funded = uint128(received);
        emit Opened(id, msg.sender, t.payee, t.token, t.amount, e.funded, t.deadline);
    }

    /// @inheritdoc ISettlementEscrow
    function approve(uint256 id) external nonReentrant {
        Escrow storage e = _escrows[id];
        _requireLive(e);
        uint16 bit = uint16(1) << uint16(_approverIndex(e, msg.sender));
        if (e.approvals & bit != 0) revert AlreadyApproved();
        e.approvals |= bit;
        e.approvalCount += 1;
        emit Approved(id, msg.sender, e.approvalCount, e.quorum);
        if (e.state == State.Open) _rule(id, e);
    }

    /// @inheritdoc ISettlementEscrow
    function dispute(uint256 id) external nonReentrant {
        Escrow storage e = _escrows[id];
        _requireLive(e);
        if (msg.sender != e.payer && msg.sender != e.payee) revert NotParty();
        if (e.disputed) revert AlreadyDisputed();
        e.disputed = true;
        emit Disputed(id, msg.sender);
        if (e.state == State.Open) _rule(id, e);
    }

    /// @inheritdoc ISettlementEscrow
    function rule(uint256 id) external nonReentrant returns (uint8 act) {
        Escrow storage e = _escrows[id];
        _requireLive(e);
        if (e.state == State.Held && block.timestamp < e.heldUntil) revert HoldActive();
        return _rule(id, e);
    }

    /// @inheritdoc ISettlementEscrow
    function resolve(uint256 id, Verdict v) external nonReentrant {
        Escrow storage e = _escrows[id];
        if (e.arbiter == address(0) || msg.sender != e.arbiter) revert NotArbiter();
        if (v == Verdict.Dismiss) {
            _requireLive(e);
            if (!e.disputed) revert NotDisputed();
            e.disputed = false;
            emit Resolved(id, msg.sender, v);
            _rule(id, e); // the arbiter is the party authorised during the window
        } else {
            if (e.state != State.Held) revert BadState();
            emit Resolved(id, msg.sender, v);
            if (v == Verdict.Release) _settle(id, e);
            else _refund(id, e);
        }
    }

    /// @inheritdoc ISettlementEscrow
    function refund(uint256 id) external nonReentrant {
        Escrow storage e = _escrows[id];
        _requireLive(e);
        if (msg.sender == e.payee) {
            // the payee cancels: the payer's funds return at any time
        } else if (msg.sender == e.payer) {
            if (block.timestamp <= e.deadline) revert DeadlineNotPassed();
            if (e.state == State.Held && block.timestamp < e.heldUntil) revert HoldActive();
        } else {
            revert NotParty();
        }
        _refund(id, e);
    }

    // --------------------------------------------------------------- guardian
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function paused() public view override(ISettlementEscrow, Pausable) returns (bool) {
        return Pausable.paused();
    }

    function setThrottle(uint128 cap, uint32 window) external onlyOwner {
        _throttle.cap = cap;
        _throttle.window = window;
        emit ThrottleSet(cap, window);
    }

    function throttle()
        external
        view
        returns (uint128 cap, uint32 window, uint128 windowVolume, uint40 windowStart)
    {
        Throttle memory t = _throttle;
        return (t.cap, t.window, t.windowVolume, t.windowStart);
    }

    // ------------------------------------------------------------------ views
    /// @inheritdoc ISettlementEscrow
    function observe(uint256 id) external view returns (uint8 obs) {
        Escrow storage e = _escrows[id];
        if (e.state == State.None) revert BadState();
        return _observe(id, e);
    }

    /// @inheritdoc ISettlementEscrow
    function preview(uint256 id) external view returns (uint8 obs, uint8 act) {
        Escrow storage e = _escrows[id];
        if (e.state == State.None) revert BadState();
        obs = _observe(id, e);
        act = CrossingLaw.rule(obs);
    }

    /// @inheritdoc ISettlementEscrow
    /// @dev the fold: OR on masks is min on acts, so the weakest crossing rules the batch
    function previewBatch(uint256[] calldata ids) external view returns (uint256 mask, uint8 act) {
        mask = CrossingLaw.FLOOR;
        for (uint256 i = 0; i < ids.length; i++) {
            Escrow storage e = _escrows[ids[i]];
            if (e.state == State.None) revert BadState();
            mask = CrossingLaw.fold(mask, CrossingLaw.mask(_observe(ids[i], e)));
            if (mask & 1 != 0) break; // a veto anywhere vetoes the batch: early exit
        }
        act = CrossingLaw.actOf(mask);
    }

    /// @inheritdoc ISettlementEscrow
    function getEscrow(uint256 id) external view returns (EscrowView memory v) {
        Escrow storage e = _escrows[id];
        v.payer = e.payer;
        v.payee = e.payee;
        v.token = e.token;
        v.amount = e.amount;
        v.funded = e.funded;
        v.deadline = e.deadline;
        v.holdWindow = e.holdWindow;
        v.heldUntil = e.heldUntil;
        v.quorum = e.quorum;
        v.approvalCount = e.approvalCount;
        v.approvals = e.approvals;
        v.approvers = e.approvers;
        v.oracle = e.oracle;
        v.priceFeed = e.priceFeed;
        v.arbiter = e.arbiter;
        v.termsHash = e.termsHash;
        v.state = e.state;
        v.disputed = e.disputed;
        v.lastObs = e.lastObs;
        v.lastAct = e.lastAct;
    }

    /// @inheritdoc ISettlementEscrow
    function escrowCount() external view returns (uint256) {
        return _count;
    }

    /// @notice the clock the measurement reads (lets a UI show countdowns on the chain's time)
    function chainTime() external view returns (uint256) {
        return block.timestamp;
    }

    // ---------------------------------------------------------------- the law
    /// @dev measure, rule, record, act. The only place value can cross by the law.
    function _rule(uint256 id, Escrow storage e) internal returns (uint8 act) {
        uint8 obs = _observe(id, e);
        act = CrossingLaw.rule(obs);
        e.lastObs = obs;
        e.lastAct = act;
        emit Ruled(id, obs, act);
        if (act == CrossingLaw.ACT_SETTLE) {
            _settle(id, e);
        } else if (act == CrossingLaw.ACT_ESCROW) {
            e.state = State.Held;
            uint40 until = uint40(block.timestamp + e.holdWindow);
            e.heldUntil = until;
            emit HeldFor(id, until);
        } else if (act == CrossingLaw.ACT_RESERVED) {
            revert ReservedAct(); // unreachable by construction; asserted anyway
        }
        // ATTEST / REJECT: recorded, nothing moves
    }

    /// @dev effects, event, then the single interaction (checks-effects-interactions)
    function _settle(uint256 id, Escrow storage e) internal {
        e.state = State.Settled;
        _recordVolume(e.amount);
        uint128 amt = e.funded;
        address to = e.payee;
        emit Settled(id, to, amt);
        IERC20(e.token).safeTransfer(to, amt);
    }

    function _refund(uint256 id, Escrow storage e) internal {
        e.state = State.Refunded;
        uint128 amt = e.funded;
        address to = e.payer;
        emit Refunded(id, to, amt);
        IERC20(e.token).safeTransfer(to, amt);
    }

    // ------------------------------------------------------------ measurement
    /// @dev THE MEASUREMENT. Each bit is set by a positive finding AND by any failure to measure.
    function _observe(uint256 id, Escrow storage e) internal view returns (uint8 obs) {
        // bit 0 UNFUNDED: holds less than agreed, or the balance could not be read
        if (e.funded < e.amount || !_balanceCovers(e.token, e.funded)) obs |= CrossingLaw.UNFUNDED;
        // bit 1 EXPIRED: the deadline has passed, or the clock could not be read
        if (e.deadline == 0 || block.timestamp > e.deadline) obs |= CrossingLaw.EXPIRED;
        // bit 2 UNSIGNED: fewer signatures than the quorum
        if (e.approvalCount < e.quorum) obs |= CrossingLaw.UNSIGNED;
        // bit 3 UNCONFIRMED: the oracle the terms require has not confirmed, or could not be reached
        if (e.oracle != address(0) && !_oracleConfirmed(e.oracle, id)) obs |= CrossingLaw.UNCONFIRMED;
        // bit 4 DISPUTED
        if (e.disputed) obs |= CrossingLaw.DISPUTED;
        // bit 5 DEPEGGED: off its band, or the feed is stale or could not be read
        if (e.priceFeed != address(0) && !_pegged(e.priceFeed)) obs |= CrossingLaw.DEPEGGED;
        // bit 6 PAUSED
        if (Pausable.paused()) obs |= CrossingLaw.PAUSED;
        // bit 7 THROTTLED: value settled this window at or above the ceiling
        if (_throttled(e.amount)) obs |= CrossingLaw.THROTTLED;
    }

    function _balanceCovers(address token, uint128 funded) internal view returns (bool) {
        if (token.code.length == 0) return false;
        try IERC20(token).balanceOf{gas: MEASURE_GAS}(address(this)) returns (uint256 bal) {
            return bal >= funded;
        } catch {
            return false;
        }
    }

    function _oracleConfirmed(address oracle, uint256 id) internal view returns (bool) {
        if (oracle.code.length == 0) return false;
        try ISettlementOracle(oracle).isConfirmed{gas: MEASURE_GAS}(id) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    function _pegged(address feed) internal view returns (bool) {
        if (feed.code.length == 0) return false;
        uint8 dec;
        try IAggregatorV3(feed).decimals{gas: MEASURE_GAS}() returns (uint8 d) {
            dec = d;
        } catch {
            return false;
        }
        if (dec > 70) return false;
        try IAggregatorV3(feed).latestRoundData{gas: MEASURE_GAS}() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) return false;
            if (block.timestamp - updatedAt > FEED_HEARTBEAT) return false;
            uint256 one = 10 ** uint256(dec);
            uint256 a = uint256(answer);
            uint256 diff = a > one ? a - one : one - a;
            if (diff > type(uint256).max / 10_000) return false;
            return diff * 10_000 <= PEG_BAND_BPS * one;
        } catch {
            return false;
        }
    }

    function _throttled(uint128 amount) internal view returns (bool) {
        Throttle memory t = _throttle;
        if (t.cap == 0) return false;
        uint256 vol = 0;
        if (block.timestamp < uint256(t.windowStart) + t.window) vol = t.windowVolume;
        return vol + amount > t.cap;
    }

    function _recordVolume(uint128 amount) internal {
        Throttle storage t = _throttle;
        if (t.cap == 0) return;
        if (block.timestamp >= uint256(t.windowStart) + t.window) {
            t.windowStart = uint40(block.timestamp);
            t.windowVolume = amount;
        } else {
            t.windowVolume += amount;
        }
    }

    // ---------------------------------------------------------------- helpers
    function _requireLive(Escrow storage e) internal view {
        if (e.state != State.Open && e.state != State.Held) revert BadState();
    }

    function _approverIndex(Escrow storage e, address who) internal view returns (uint256) {
        address[] storage a = e.approvers;
        uint256 n = a.length;
        for (uint256 i = 0; i < n; i++) {
            if (a[i] == who) return i;
        }
        revert NotApprover();
    }

    function _validateTerms(Terms calldata t) internal view {
        if (t.payee == address(0) || t.token == address(0)) revert BadTerms("zero address");
        if (t.payee == msg.sender) revert BadTerms("payer is payee");
        if (t.amount == 0) revert BadTerms("amount");
        if (t.deadline <= block.timestamp) revert BadTerms("deadline");
        if (t.holdWindow == 0) revert BadTerms("holdWindow");
        uint256 n = t.approvers.length;
        if (n > MAX_APPROVERS) revert BadTerms("approvers");
        if (t.quorum > n) revert BadTerms("quorum");
        for (uint256 i = 0; i < n; i++) {
            if (t.approvers[i] == address(0)) revert BadTerms("approver zero");
            for (uint256 j = 0; j < i; j++) {
                if (t.approvers[j] == t.approvers[i]) revert BadTerms("approver dup");
            }
        }
    }
}
