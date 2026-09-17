// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CrossingLaw — THE CROSSING LAW, ported lane-for-lane from law/crossing.c
/// @notice A total, branchless, monotone decision function over an 8-bit situation byte.
///         Every observation bit is a HAZARD (set by a positive finding AND by any
///         measurement that could not complete). There are no gates.
///
///   act 4 SETTLE    the value crosses to the beneficiary. Final. The FLOOR: earned by 0x00 only.
///   act 3 RESERVED  no lane today. Never returned.
///   act 2 ESCROW    held in a reversible state (a hold window, an arbiter may reverse)
///   act 1 ATTEST    recorded, nothing moves, re-rule when a measurement completes
///   act 0 REJECT    the crossing never enters
///
///   bit 0 UNFUNDED    veto      bit 4 DISPUTED   degrade
///   bit 1 EXPIRED     veto      bit 5 DEPEGGED   degrade
///   bit 2 UNSIGNED    attest    bit 6 PAUSED     degrade
///   bit 3 UNCONFIRMED attest    bit 7 THROTTLED  degrade
///
///   veto -> mask bit 0 (c=1), attest -> mask bit 1 (c=2), degrade -> mask bit 2 (c=4),
///   mask bit 3 RESERVED, FLOOR = mask bit 4 (always set).  act = ctz(mask & -mask).
library CrossingLaw {
    uint8 internal constant UNFUNDED = 1 << 0;
    uint8 internal constant EXPIRED = 1 << 1;
    uint8 internal constant UNSIGNED = 1 << 2;
    uint8 internal constant UNCONFIRMED = 1 << 3;
    uint8 internal constant DISPUTED = 1 << 4;
    uint8 internal constant DEPEGGED = 1 << 5;
    uint8 internal constant PAUSED = 1 << 6;
    uint8 internal constant THROTTLED = 1 << 7;

    uint8 internal constant ACT_REJECT = 0;
    uint8 internal constant ACT_ATTEST = 1;
    uint8 internal constant ACT_ESCROW = 2;
    uint8 internal constant ACT_RESERVED = 3;
    uint8 internal constant ACT_SETTLE = 4;

    uint256 internal constant FLOOR = 16; // mask bit 4: SETTLE, the constant bit
    uint256 internal constant RESERVED = 8; // mask bit 3: the gap. No term.

    // ---- the eight lanes, authored by search, each certified L(x) == c * bit_i on 0..255 ----
    function lUnfunded(uint256 x) internal pure returns (uint256) {
        return (x & 1);
    }

    function lExpired(uint256 x) internal pure returns (uint256) {
        return (1 & (x >> 1));
    }

    function lUnsigned(uint256 x) internal pure returns (uint256) {
        return ((x >> 1) & 2);
    }

    function lUnconfirmed(uint256 x) internal pure returns (uint256) {
        return ((1 & (x >> 3)) + (1 & (x >> 3)));
    }

    function lDisputed(uint256 x) internal pure returns (uint256) {
        return ((x & 16) >> 2);
    }

    function lDepegged(uint256 x) internal pure returns (uint256) {
        return ((2 & (x >> 4)) << 1);
    }

    function lPaused(uint256 x) internal pure returns (uint256) {
        return (((x >> 6) & 1) << 2);
    }

    /// @dev the reference's (1^(x>>6)) - (1-(x>>6)) form; valid in wrapping arithmetic
    function lThrottled(uint256 x) internal pure returns (uint256) {
        unchecked {
            return ((1 ^ (x >> 6)) - (1 - (x >> 6)));
        }
    }

    /// @notice MASK: lanes OR-ed within their tier, tiers OR-ed, FLOOR always set.
    function mask(uint256 obs) internal pure returns (uint256 m) {
        uint256 x = obs & 0xFF;
        m = (lUnfunded(x) | lExpired(x)) // mask bit 0  REJECT
            | (lUnsigned(x) | lUnconfirmed(x)) // mask bit 1  ATTEST
            | (lDisputed(x) | lDepegged(x) | lPaused(x) | lThrottled(x)) // mask bit 2  ESCROW
            | FLOOR;
    }

    /// @notice EMIT: the lowest set bit, m & -m.
    function emitLow(uint256 m) internal pure returns (uint256) {
        unchecked {
            return m & (~m + 1);
        }
    }

    /// @notice ctz over a one-hot value in {1,2,4,8,16}, branchless.
    function ctz5(uint256 low) internal pure returns (uint8) {
        return uint8(
            ((low >> 1) & 1) + (((low >> 2) & 1) << 1) + (((low >> 3) & 1) * 3) + (((low >> 4) & 1) << 2)
        );
    }

    /// @notice act of a mask: ctz(EMIT(m)).
    function actOf(uint256 m) internal pure returns (uint8) {
        return ctz5(emitLow(m));
    }

    /// @notice THE LAW. One MASK, one EMIT, one ctz, no branch.
    function rule(uint256 obs) internal pure returns (uint8 act) {
        return actOf(mask(obs));
    }

    /// @notice fold for batches: OR on masks is min on acts.
    function fold(uint256 a, uint256 b) internal pure returns (uint256) {
        return a | b;
    }
}

/// @title CrossingLawHarness — external pure surface of the law for tests and the dApp
contract CrossingLawHarness {
    function rule(uint256 obs) external pure returns (uint8) {
        return CrossingLaw.rule(obs);
    }

    function mask(uint256 obs) external pure returns (uint256) {
        return CrossingLaw.mask(obs);
    }

    function actOf(uint256 m) external pure returns (uint8) {
        return CrossingLaw.actOf(m);
    }

    function fold(uint256 a, uint256 b) external pure returns (uint256) {
        return CrossingLaw.fold(a, b);
    }

    /// @notice the eight lane values for x, in bit order 0..7
    function lanes(uint256 x) external pure returns (uint256[8] memory l) {
        x &= 0xFF;
        l[0] = CrossingLaw.lUnfunded(x);
        l[1] = CrossingLaw.lExpired(x);
        l[2] = CrossingLaw.lUnsigned(x);
        l[3] = CrossingLaw.lUnconfirmed(x);
        l[4] = CrossingLaw.lDisputed(x);
        l[5] = CrossingLaw.lDepegged(x);
        l[6] = CrossingLaw.lPaused(x);
        l[7] = CrossingLaw.lThrottled(x);
    }
}
