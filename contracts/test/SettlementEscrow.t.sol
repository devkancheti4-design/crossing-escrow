// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {SettlementEscrow} from "../contracts/SettlementEscrow.sol";
import {ISettlementEscrow} from "../contracts/interfaces/ISettlementEscrow.sol";
import {CrossingLaw} from "../contracts/CrossingLaw.sol";
import {MockUSD} from "../contracts/mocks/MockUSD.sol";
import {FeeOnTransferToken} from "../contracts/mocks/FeeOnTransferToken.sol";
import {ReentrantToken} from "../contracts/mocks/ReentrantToken.sol";
import {MockSettlementOracle, RevertingOracle, GasGuzzlerOracle} from "../contracts/mocks/MockSettlementOracle.sol";
import {MockPriceFeed} from "../contracts/mocks/MockPriceFeed.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SettlementEscrowTest is Test {
    SettlementEscrow esc;
    MockUSD usd;
    MockSettlementOracle oracle;
    MockPriceFeed feed;

    address guardian = makeAddr("guardian");
    address payer = makeAddr("payer");
    address payee = makeAddr("payee");
    address a1 = makeAddr("approver1");
    address a2 = makeAddr("approver2");
    address a3 = makeAddr("approver3");
    address oracleOp = makeAddr("oracleOperator");
    address arbiter = makeAddr("arbiter");
    address feedOp = makeAddr("feedOperator");
    address stranger = makeAddr("stranger");

    uint128 constant AMOUNT = 1_000e6;
    uint32 constant HOLD = 1 days;

    function setUp() public {
        vm.warp(1_800_000_000);
        usd = new MockUSD();
        oracle = new MockSettlementOracle(oracleOp);
        feed = new MockPriceFeed(feedOp);
        esc = new SettlementEscrow(guardian, 200, 3600);
        usd.mint(payer, 1_000_000e6);
        vm.prank(payer);
        usd.approve(address(esc), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers
    function _approvers() internal view returns (address[] memory a) {
        a = new address[](3);
        a[0] = a1;
        a[1] = a2;
        a[2] = a3;
    }

    function _terms() internal view returns (ISettlementEscrow.Terms memory t) {
        t.payee = payee;
        t.token = address(usd);
        t.amount = AMOUNT;
        t.deadline = uint40(block.timestamp + 7 days);
        t.holdWindow = HOLD;
        t.quorum = 2;
        t.approvers = _approvers();
        t.oracle = address(0);
        t.priceFeed = address(0);
        t.arbiter = arbiter;
        t.termsHash = keccak256("invoice #1");
    }

    function _open(ISettlementEscrow.Terms memory t) internal returns (uint256 id) {
        vm.prank(payer);
        id = esc.open(t);
    }

    function _approveAll(uint256 id) internal {
        vm.prank(a1);
        esc.approve(id);
        vm.prank(a2);
        esc.approve(id);
    }

    function _state(uint256 id) internal view returns (ISettlementEscrow.State) {
        return esc.getEscrow(id).state;
    }

    // -------------------------------------------------------------------- open
    function test_Open_PullsFundsAndRecords() public {
        uint256 before = usd.balanceOf(payer);
        vm.expectEmit(true, true, true, true);
        emit ISettlementEscrow.Opened(1, payer, payee, address(usd), AMOUNT, AMOUNT, uint40(block.timestamp + 7 days));
        uint256 id = _open(_terms());
        assertEq(id, 1);
        assertEq(esc.escrowCount(), 1);
        ISettlementEscrow.EscrowView memory v = esc.getEscrow(id);
        assertEq(uint8(v.state), uint8(ISettlementEscrow.State.Open));
        assertEq(v.funded, AMOUNT);
        assertEq(v.payer, payer);
        assertEq(v.approvers.length, 3);
        assertEq(usd.balanceOf(payer), before - AMOUNT);
        assertEq(usd.balanceOf(address(esc)), AMOUNT);
        (uint8 obs, uint8 act) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNSIGNED);
        assertEq(act, CrossingLaw.ACT_ATTEST);
    }

    function test_Open_BadTerms() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.amount = 0;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ISettlementEscrow.BadTerms.selector, "amount"));
        esc.open(t);

        t = _terms();
        t.deadline = uint40(block.timestamp);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ISettlementEscrow.BadTerms.selector, "deadline"));
        esc.open(t);

        t = _terms();
        t.quorum = 4;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ISettlementEscrow.BadTerms.selector, "quorum"));
        esc.open(t);

        t = _terms();
        t.approvers[1] = a1;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ISettlementEscrow.BadTerms.selector, "approver dup"));
        esc.open(t);

        t = _terms();
        t.payee = payer;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ISettlementEscrow.BadTerms.selector, "payer is payee"));
        esc.open(t);

        t = _terms();
        t.holdWindow = 0;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ISettlementEscrow.BadTerms.selector, "holdWindow"));
        esc.open(t);
    }

    function test_Open_WhenPaused_Reverts() public {
        vm.prank(guardian);
        esc.pause();
        vm.prank(payer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.open(_terms());
    }

    // ---------------------------------------------------------------- multisig
    function test_Multisig_HappyPath_SettlesOnQuorum() public {
        uint256 id = _open(_terms());

        vm.expectEmit(true, false, false, true);
        emit ISettlementEscrow.Ruled(id, CrossingLaw.UNSIGNED, CrossingLaw.ACT_ATTEST);
        vm.prank(a1);
        esc.approve(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));
        assertEq(usd.balanceOf(payee), 0);

        vm.expectEmit(true, false, false, true);
        emit ISettlementEscrow.Ruled(id, 0x00, CrossingLaw.ACT_SETTLE);
        vm.expectEmit(true, true, false, true);
        emit ISettlementEscrow.Settled(id, payee, AMOUNT);
        vm.prank(a2);
        esc.approve(id);

        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
        assertEq(usd.balanceOf(payee), AMOUNT);
        assertEq(usd.balanceOf(address(esc)), 0);
        ISettlementEscrow.EscrowView memory v = esc.getEscrow(id);
        assertEq(v.lastObs, 0);
        assertEq(v.lastAct, 4);
        assertEq(v.approvalCount, 2);

        // terminal: nothing further
        vm.prank(a3);
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.approve(id);
        vm.prank(payee);
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.refund(id);
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.rule(id);
    }

    function test_Approve_AccessAndDoubleApproval() public {
        uint256 id = _open(_terms());
        vm.prank(stranger);
        vm.expectRevert(ISettlementEscrow.NotApprover.selector);
        esc.approve(id);
        vm.prank(a1);
        esc.approve(id);
        vm.prank(a1);
        vm.expectRevert(ISettlementEscrow.AlreadyApproved.selector);
        esc.approve(id);
        assertEq(esc.getEscrow(id).approvals, 1);
    }

    function test_Rule_IsPermissionlessAndInformational() public {
        uint256 id = _open(_terms());
        vm.prank(stranger);
        uint8 act = esc.rule(id);
        assertEq(act, CrossingLaw.ACT_ATTEST);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));
    }

    // ------------------------------------------------------------------ oracle
    function test_OraclePath_SettlesOnConfirmation() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.quorum = 0;
        t.oracle = address(oracle);
        uint256 id = _open(t);
        (uint8 obs, uint8 act) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNCONFIRMED);
        assertEq(act, CrossingLaw.ACT_ATTEST);
        esc.rule(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));

        vm.prank(oracleOp);
        oracle.setConfirmed(id, true);
        esc.rule(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
        assertEq(usd.balanceOf(payee), AMOUNT);
    }

    function test_BothPaths_QuorumAndOracleRequired() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.oracle = address(oracle);
        uint256 id = _open(t);
        _approveAll(id);
        (uint8 obs, uint8 act) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNCONFIRMED);
        assertEq(act, CrossingLaw.ACT_ATTEST);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));
        vm.prank(oracleOp);
        oracle.setConfirmed(id, true);
        esc.rule(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
    }

    function test_RevertingOracle_SetsUnconfirmed_NoRevert() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.quorum = 0;
        t.oracle = address(new RevertingOracle());
        uint256 id = _open(t);
        (uint8 obs, uint8 act) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNCONFIRMED);
        assertEq(act, CrossingLaw.ACT_ATTEST);
        esc.rule(id);
    }

    function test_GasGuzzlerOracle_IsContainedByTheGasCap() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.quorum = 0;
        t.oracle = address(new GasGuzzlerOracle());
        uint256 id = _open(t);
        uint256 g = gasleft();
        uint8 act = esc.rule(id);
        uint256 used = g - gasleft();
        assertEq(act, CrossingLaw.ACT_ATTEST);
        assertLt(used, 400_000, "measurement gas cap contains a guzzler");
    }

    function test_OracleWithoutCode_SetsUnconfirmed() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.quorum = 0;
        t.oracle = stranger; // an EOA
        uint256 id = _open(t);
        (uint8 obs,) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNCONFIRMED);
    }

    // ----------------------------------------------------------------- dispute
    function test_Dispute_NarrowerOutranksWider_ThenHolds() public {
        uint256 id = _open(_terms());
        vm.expectEmit(true, false, false, true);
        emit ISettlementEscrow.Ruled(id, CrossingLaw.UNSIGNED | CrossingLaw.DISPUTED, CrossingLaw.ACT_ATTEST);
        vm.prank(payer);
        esc.dispute(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open), "ATTEST outranks ESCROW");

        vm.prank(a1);
        esc.approve(id);
        vm.expectEmit(true, false, false, true);
        emit ISettlementEscrow.Ruled(id, CrossingLaw.DISPUTED, CrossingLaw.ACT_ESCROW);
        vm.expectEmit(true, false, false, true);
        emit ISettlementEscrow.HeldFor(id, uint40(block.timestamp + HOLD));
        vm.prank(a2);
        esc.approve(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Held));
        assertEq(esc.getEscrow(id).heldUntil, block.timestamp + HOLD);
        assertEq(usd.balanceOf(payee), 0, "nothing moved");

        // the window is respected
        vm.expectRevert(ISettlementEscrow.HoldActive.selector);
        esc.rule(id);
        vm.prank(payer);
        vm.expectRevert(ISettlementEscrow.AlreadyDisputed.selector);
        esc.dispute(id);
    }

    function test_Dispute_ArbiterRelease() public {
        uint256 id = _open(_terms());
        vm.prank(payee);
        esc.dispute(id);
        _approveAll(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Held));
        vm.expectEmit(true, true, false, true);
        emit ISettlementEscrow.Resolved(id, arbiter, ISettlementEscrow.Verdict.Release);
        vm.prank(arbiter);
        esc.resolve(id, ISettlementEscrow.Verdict.Release);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
        assertEq(usd.balanceOf(payee), AMOUNT);
    }

    function test_Dispute_ArbiterRefund() public {
        uint256 id = _open(_terms());
        vm.prank(payer);
        esc.dispute(id);
        _approveAll(id);
        uint256 before = usd.balanceOf(payer);
        vm.prank(arbiter);
        esc.resolve(id, ISettlementEscrow.Verdict.Refund);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Refunded));
        assertEq(usd.balanceOf(payer), before + AMOUNT);
        assertEq(usd.balanceOf(address(esc)), 0);
    }

    function test_Dispute_ArbiterDismiss_ReRulesImmediately() public {
        uint256 id = _open(_terms());
        vm.prank(payer);
        esc.dispute(id);
        _approveAll(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Held));
        vm.prank(arbiter);
        esc.resolve(id, ISettlementEscrow.Verdict.Dismiss);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled), "clean byte settles");
        assertEq(usd.balanceOf(payee), AMOUNT);
    }

    function test_Dismiss_InOpen_ClearsDisputeOnly() public {
        uint256 id = _open(_terms());
        vm.prank(payer);
        esc.dispute(id);
        vm.prank(arbiter);
        esc.resolve(id, ISettlementEscrow.Verdict.Dismiss);
        assertFalse(esc.getEscrow(id).disputed);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));
        vm.prank(arbiter);
        vm.expectRevert(ISettlementEscrow.NotDisputed.selector);
        esc.resolve(id, ISettlementEscrow.Verdict.Dismiss);
    }

    function test_Held_ReRuleAfterWindow_ReHoldsWhileDisputed() public {
        uint256 id = _open(_terms());
        vm.prank(payer);
        esc.dispute(id);
        _approveAll(id);
        uint40 first = esc.getEscrow(id).heldUntil;
        vm.warp(first);
        uint8 act = esc.rule(id);
        assertEq(act, CrossingLaw.ACT_ESCROW);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Held));
        assertEq(esc.getEscrow(id).heldUntil, first + HOLD, "window extended");
    }

    function test_Arbiter_AccessAndScope() public {
        uint256 id = _open(_terms());
        vm.prank(stranger);
        vm.expectRevert(ISettlementEscrow.NotArbiter.selector);
        esc.resolve(id, ISettlementEscrow.Verdict.Release);
        vm.prank(guardian);
        vm.expectRevert(ISettlementEscrow.NotArbiter.selector);
        esc.resolve(id, ISettlementEscrow.Verdict.Refund);
        // the arbiter can never act outside Held
        vm.prank(arbiter);
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.resolve(id, ISettlementEscrow.Verdict.Release);
        vm.prank(arbiter);
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.resolve(id, ISettlementEscrow.Verdict.Refund);
        // no arbiter configured: nobody can resolve
        ISettlementEscrow.Terms memory t = _terms();
        t.arbiter = address(0);
        uint256 id2 = _open(t);
        vm.prank(arbiter);
        vm.expectRevert(ISettlementEscrow.NotArbiter.selector);
        esc.resolve(id2, ISettlementEscrow.Verdict.Dismiss);
    }

    function test_Dispute_NotParty() public {
        uint256 id = _open(_terms());
        vm.prank(stranger);
        vm.expectRevert(ISettlementEscrow.NotParty.selector);
        esc.dispute(id);
    }

    // ----------------------------------------------------------------- timeout
    function test_Timeout_PayerRefund() public {
        uint256 id = _open(_terms());
        vm.prank(payer);
        vm.expectRevert(ISettlementEscrow.DeadlineNotPassed.selector);
        esc.refund(id);

        vm.warp(block.timestamp + 7 days + 1);
        (uint8 obs, uint8 act) = esc.preview(id);
        assertEq(obs, CrossingLaw.EXPIRED | CrossingLaw.UNSIGNED);
        assertEq(act, CrossingLaw.ACT_REJECT);
        // even a full quorum cannot cross after the deadline
        _approveAll(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));
        assertEq(esc.getEscrow(id).lastAct, CrossingLaw.ACT_REJECT);

        uint256 before = usd.balanceOf(payer);
        vm.expectEmit(true, true, false, true);
        emit ISettlementEscrow.Refunded(id, payer, AMOUNT);
        vm.prank(payer);
        esc.refund(id);
        assertEq(usd.balanceOf(payer), before + AMOUNT);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Refunded));
    }

    function test_Timeout_WhileHeld_WaitsForWindow() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.deadline = uint40(block.timestamp + 1 hours);
        uint256 id = _open(t);
        vm.prank(payer);
        esc.dispute(id);
        _approveAll(id); // Held, window = 1 day, deadline in 1 hour
        vm.warp(block.timestamp + 2 hours);
        vm.prank(payer);
        vm.expectRevert(ISettlementEscrow.HoldActive.selector);
        esc.refund(id);
        // the arbiter still has the window
        vm.warp(block.timestamp + 1 days);
        vm.prank(payer);
        esc.refund(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Refunded));
    }

    function test_Payee_CancelAnyTime() public {
        uint256 id = _open(_terms());
        uint256 before = usd.balanceOf(payer);
        vm.prank(payee);
        esc.refund(id);
        assertEq(usd.balanceOf(payer), before + AMOUNT);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Refunded));
    }

    function test_Refund_NotParty() public {
        uint256 id = _open(_terms());
        vm.warp(block.timestamp + 8 days);
        vm.prank(stranger);
        vm.expectRevert(ISettlementEscrow.NotParty.selector);
        esc.refund(id);
        vm.prank(guardian);
        vm.expectRevert(ISettlementEscrow.NotParty.selector);
        esc.refund(id);
    }

    // ---------------------------------------------------------------- guardian
    function test_Pause_HoldsThenUnpauseSettles_RefundStillWorks() public {
        uint256 id = _open(_terms());
        vm.prank(guardian);
        esc.pause();
        _approveAll(id);
        assertEq(esc.getEscrow(id).lastObs, CrossingLaw.PAUSED);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Held));

        // the guardian cannot trap funds: the payee can still cancel while paused
        uint256 id2 = 0;
        {
            vm.prank(guardian);
            esc.unpause();
            id2 = _open(_terms());
            vm.prank(guardian);
            esc.pause();
            vm.prank(payee);
            esc.refund(id2);
            assertEq(uint8(_state(id2)), uint8(ISettlementEscrow.State.Refunded));
        }

        vm.prank(guardian);
        esc.unpause();
        vm.warp(esc.getEscrow(id).heldUntil);
        esc.rule(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
        assertEq(usd.balanceOf(payee), AMOUNT);
    }

    function test_Guardian_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        esc.pause();
        vm.prank(stranger);
        vm.expectRevert();
        esc.setThrottle(1, 1);
    }

    function test_Throttle_HoldsThenNextWindowSettles() public {
        vm.prank(guardian);
        esc.setThrottle(1_500e6, 1 hours);
        uint256 idA = _open(_terms());
        _approveAll(idA);
        assertEq(uint8(_state(idA)), uint8(ISettlementEscrow.State.Settled));
        (,, uint128 vol,) = esc.throttle();
        assertEq(vol, AMOUNT);

        uint256 idB = _open(_terms());
        _approveAll(idB);
        assertEq(esc.getEscrow(idB).lastObs, CrossingLaw.THROTTLED);
        assertEq(uint8(_state(idB)), uint8(ISettlementEscrow.State.Held));

        vm.warp(esc.getEscrow(idB).heldUntil); // > 1 hour later the window has rolled
        esc.rule(idB);
        assertEq(uint8(_state(idB)), uint8(ISettlementEscrow.State.Settled));
        (,, vol,) = esc.throttle();
        assertEq(vol, AMOUNT, "new window starts with this crossing");
    }

    // -------------------------------------------------------------------- peg
    function test_Depeg_HoldsThenRepegSettles() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.priceFeed = address(feed);
        uint256 id = _open(t);
        vm.prank(feedOp);
        feed.setAnswer(0.97e8); // 3% off, band is 2%
        _approveAll(id);
        assertEq(esc.getEscrow(id).lastObs, CrossingLaw.DEPEGGED);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Held));

        vm.prank(feedOp);
        feed.setAnswer(1.01e8); // within band
        vm.warp(esc.getEscrow(id).heldUntil);
        esc.rule(id);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
    }

    function test_StaleFeed_SetsDepegged() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.priceFeed = address(feed);
        uint256 id = _open(t);
        vm.prank(feedOp);
        feed.setUpdatedAt(block.timestamp - 2 days);
        (uint8 obs,) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNSIGNED | CrossingLaw.DEPEGGED);
        vm.prank(feedOp);
        feed.setUpdatedAt(0);
        (obs,) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNSIGNED);
    }

    function test_FeedWithoutCode_SetsDepegged() public {
        ISettlementEscrow.Terms memory t = _terms();
        t.priceFeed = stranger;
        uint256 id = _open(t);
        (uint8 obs,) = esc.preview(id);
        assertEq(obs, CrossingLaw.UNSIGNED | CrossingLaw.DEPEGGED);
    }

    // ---------------------------------------------------------------- unfunded
    function test_FeeOnTransfer_Unfunded_RejectsThenRefundsWhatWasFunded() public {
        FeeOnTransferToken fee = new FeeOnTransferToken(stranger);
        fee.mint(payer, 10_000e6);
        vm.prank(payer);
        fee.approve(address(esc), type(uint256).max);
        ISettlementEscrow.Terms memory t = _terms();
        t.token = address(fee);
        uint256 id = _open(t);
        ISettlementEscrow.EscrowView memory v = esc.getEscrow(id);
        assertEq(v.funded, AMOUNT - AMOUNT / 100, "funded is measured, not assumed");
        _approveAll(id);
        assertEq(esc.getEscrow(id).lastObs, CrossingLaw.UNFUNDED);
        assertEq(esc.getEscrow(id).lastAct, CrossingLaw.ACT_REJECT);
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Open));

        vm.warp(block.timestamp + 8 days);
        uint256 before = fee.balanceOf(payer);
        vm.prank(payer);
        esc.refund(id);
        // the refund transfer itself is taxed by the token, not by the escrow
        assertEq(fee.balanceOf(payer), before + v.funded - v.funded / 100);
        assertEq(fee.balanceOf(address(esc)), 0);
    }

    // -------------------------------------------------------------- reentrancy
    function test_Reentrancy_OnSettle_IsBlocked() public {
        ReentrantToken rnt = new ReentrantToken();
        rnt.mint(payer, 10_000e6);
        vm.prank(payer);
        rnt.approve(address(esc), type(uint256).max);
        ISettlementEscrow.Terms memory t = _terms();
        t.token = address(rnt);
        t.quorum = 1;
        uint256 id = _open(t);
        rnt.arm(address(esc), abi.encodeWithSelector(ISettlementEscrow.rule.selector, id));
        vm.prank(a1);
        esc.approve(id); // settles; the token re-enters during the transfer
        assertEq(rnt.attempts(), 1);
        assertEq(rnt.successes(), 0, "re-entry rejected by the guard");
        assertEq(uint8(_state(id)), uint8(ISettlementEscrow.State.Settled));
        assertEq(rnt.balanceOf(payee), AMOUNT);
        assertEq(rnt.balanceOf(address(esc)), 0);
    }

    function test_Reentrancy_OnRefund_IsBlocked() public {
        ReentrantToken rnt = new ReentrantToken();
        rnt.mint(payer, 10_000e6);
        vm.prank(payer);
        rnt.approve(address(esc), type(uint256).max);
        ISettlementEscrow.Terms memory t = _terms();
        t.token = address(rnt);
        uint256 id = _open(t);
        // try to re-enter refund (state already Refunded, guard fires first anyway)
        rnt.arm(address(esc), abi.encodeWithSelector(ISettlementEscrow.refund.selector, id));
        vm.prank(payee);
        esc.refund(id);
        assertEq(rnt.attempts(), 1);
        assertEq(rnt.successes(), 0);
        assertEq(rnt.balanceOf(payer), 10_000e6);
    }

    // ------------------------------------------------------------------- batch
    function test_PreviewBatch_TheFoldIsMin() public {
        uint256 idA = _open(_terms()); // UNSIGNED -> ATTEST (1)
        ISettlementEscrow.Terms memory t = _terms();
        t.quorum = 0;
        uint256 idB = _open(t);
        vm.prank(payer);
        esc.dispute(idB); // DISPUTED only -> ESCROW (2), Held
        uint256[] memory ids = new uint256[](2);
        ids[0] = idB;
        ids[1] = idA;
        (uint256 m, uint8 act) = esc.previewBatch(ids);
        assertEq(act, 1, "min(2,1)");
        assertEq(m, 16 | 2 | 4);

        vm.warp(block.timestamp + 8 days);
        (, act) = esc.previewBatch(ids);
        assertEq(act, 0, "a veto anywhere vetoes the batch");
    }

    // --------------------------------------------------------------- invariants
    function test_Invariant_BalanceCoversLiveEscrows() public {
        uint256 id1 = _open(_terms());
        uint256 id2 = _open(_terms());
        uint256 id3 = _open(_terms());
        _approveAll(id1); // settled
        vm.prank(payee);
        esc.refund(id2); // refunded
        vm.prank(payer);
        esc.dispute(id3);
        _approveAll(id3); // held
        uint256 live = 0;
        for (uint256 i = 1; i <= 3; i++) {
            ISettlementEscrow.EscrowView memory v = esc.getEscrow(i);
            if (v.state == ISettlementEscrow.State.Open || v.state == ISettlementEscrow.State.Held) live += v.funded;
        }
        assertEq(live, AMOUNT);
        assertGe(usd.balanceOf(address(esc)), live);
        assertEq(usd.balanceOf(address(esc)), AMOUNT);
    }

    function test_Views_RevertOnUnknownId() public {
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.preview(99);
        vm.expectRevert(ISettlementEscrow.BadState.selector);
        esc.observe(99);
    }

    // --------------------------------------------------------------------- gas
    function test_Gas_Report() public {
        ISettlementEscrow.Terms memory t = _terms();
        uint256 g0 = gasleft();
        vm.prank(payer);
        uint256 id = esc.open(t);
        uint256 gOpen = g0 - gasleft();

        g0 = gasleft();
        vm.prank(a1);
        esc.approve(id);
        uint256 gApprove = g0 - gasleft();

        g0 = gasleft();
        esc.rule(id);
        uint256 gRule = g0 - gasleft();

        g0 = gasleft();
        vm.prank(a2);
        esc.approve(id);
        uint256 gSettle = g0 - gasleft();

        uint256 id2 = _open(t);
        g0 = gasleft();
        vm.prank(payee);
        esc.refund(id2);
        uint256 gRefund = g0 - gasleft();

        console.log("GAS open (3 approvers)          ", gOpen);
        console.log("GAS approve + rule (ATTEST)     ", gApprove);
        console.log("GAS rule (ATTEST, no-op)        ", gRule);
        console.log("GAS approve + rule + SETTLE     ", gSettle);
        console.log("GAS refund (payee cancel)       ", gRefund);
        assertLt(gApprove, 120_000);
    }
}
