// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CrossingLaw, CrossingLawHarness} from "../contracts/CrossingLaw.sol";

/// @notice The Solidity port carries the same proof obligations as law/crossing.c.
contract CrossingLawTest is Test {
    CrossingLawHarness h;

    function setUp() public {
        h = new CrossingLawHarness();
    }

    // ===== INDEPENDENT ORACLE: branchy, shares no expression with the law =====
    function oracle(uint256 x) internal pure returns (uint8) {
        x &= 0xFF;
        bool unfunded = (x >> 0) & 1 == 1;
        bool expired = (x >> 1) & 1 == 1;
        bool unsigned_ = (x >> 2) & 1 == 1;
        bool unconfirmed = (x >> 3) & 1 == 1;
        bool disputed = (x >> 4) & 1 == 1;
        bool depegged = (x >> 5) & 1 == 1;
        bool paused = (x >> 6) & 1 == 1;
        bool throttled = (x >> 7) & 1 == 1;
        if (unfunded) return 0;
        if (expired) return 0;
        if (unsigned_) return 1;
        if (unconfirmed) return 1;
        if (disputed) return 2;
        if (depegged) return 2;
        if (paused) return 2;
        if (throttled) return 2;
        return 4;
    }

    function test_Exhaustive_AgreesWithOracle() public view {
        for (uint256 x = 0; x < 256; x++) {
            assertEq(h.rule(x), oracle(x), "law vs oracle");
        }
    }

    function test_Partition_SETTLE1_RESV0_ESCROW15_ATTEST48_REJECT192() public view {
        uint256[5] memory n;
        for (uint256 x = 0; x < 256; x++) {
            uint8 a = h.rule(x);
            assertTrue(a <= 4, "R7 act in 0..4");
            n[a]++;
        }
        assertEq(n[4], 1, "SETTLE");
        assertEq(n[3], 0, "RESERVED never returned");
        assertEq(n[2], 15, "ESCROW");
        assertEq(n[1], 48, "ATTEST");
        assertEq(n[0], 192, "REJECT");
    }

    function test_R1_R5_DomainRules() public view {
        for (uint256 x = 0; x < 256; x++) {
            uint8 k = h.rule(x);
            bool veto = (x & 3) != 0;
            bool att = (x & 12) != 0;
            bool esc = (x & 0xF0) != 0;
            if (veto) assertEq(k, 0, "R1 veto -> REJECT");
            assertEq(k == 4, x == 0, "R2 SETTLE iff 0x00");
            if (att && !veto) assertEq(k, 1, "R3 attest, no veto -> ATTEST");
            if (esc && !veto && !att) assertEq(k, 2, "R4 degrade only -> ESCROW");
            if ((x & 4) != 0 && (x & 16) != 0 && !veto) assertEq(k, 1, "R5 narrower outranks wider");
            if (x != 0) assertTrue(k != 4, "THE THEOREM: act 4 on a non-zero byte");
        }
    }

    function test_R6_Monotone_256x8() public view {
        for (uint256 x = 0; x < 256; x++) {
            for (uint256 i = 0; i < 8; i++) {
                if (x & (1 << i) == 0) {
                    assertLe(h.rule(x | (1 << i)), h.rule(x), "a hazard never raises the act");
                }
            }
        }
    }

    function test_Certificates_EveryLaneIs_c_times_bit_i() public view {
        uint8[8] memory c = [1, 1, 2, 2, 4, 4, 4, 4];
        for (uint256 x = 0; x < 256; x++) {
            uint256[8] memory l = h.lanes(x);
            for (uint256 i = 0; i < 8; i++) {
                assertEq(l[i], uint256(c[i]) * ((x >> i) & 1), "certificate");
            }
        }
    }

    function test_Taught() public view {
        uint8[5] memory ts = [0x00, 0x01, 0x02, 0x04, 0x10];
        uint8[5] memory ta = [4, 0, 0, 1, 2];
        for (uint256 i = 0; i < 5; i++) assertEq(h.rule(ts[i]), ta[i], "TAUGHT");
    }

    function test_HeldOut_ScoredApart() public view {
        uint8[6] memory hs = [0x08, 0x20, 0x40, 0x18, 0x21, 0xFF];
        uint8[6] memory ha = [1, 2, 2, 1, 0, 0];
        for (uint256 i = 0; i < 6; i++) assertEq(h.rule(hs[i]), ha[i], "HELD-OUT");
        // the landing pair
        assertEq(h.rule(0x04), 1);
        assertEq(h.rule(0x00), 4);
    }

    /// @notice TOTALITY: the law is defined on every uint256 and agrees with its own low byte.
    function testFuzz_Totality(uint256 obs) public view {
        uint8 a = h.rule(obs);
        assertTrue(a == 0 || a == 1 || a == 2 || a == 4, "acts outside {0,1,2,4}");
        assertEq(a, h.rule(obs & 0xFF), "disagrees with own byte");
        if (obs & 0xFF != 0) assertTrue(a != 4, "act 4 on a non-zero low byte");
        else assertEq(a, 4);
        assertEq(a, oracle(obs), "fuzz vs oracle");
    }

    /// @notice THE FOLD: OR on masks is min on acts; batches nest.
    function test_Fold_HomomorphismIdempotentCommutativeIdentity() public view {
        // the 8 distinct masks the law can produce: FLOOR | subset of {1,2,4}
        for (uint256 a = 0; a < 8; a++) {
            uint256 ma = 16 | a;
            assertEq(h.fold(ma, ma), ma, "F2 idempotent");
            assertEq(h.fold(ma, 16), ma, "F4 identity");
            for (uint256 b = 0; b < 8; b++) {
                uint256 mb = 16 | b;
                uint8 aa = h.actOf(ma);
                uint8 bb = h.actOf(mb);
                uint8 ab = h.actOf(h.fold(ma, mb));
                assertEq(ab, aa < bb ? aa : bb, "F1 ACT(a|b) == min");
                assertEq(h.fold(ma, mb), h.fold(mb, ma), "F3 commutative");
                if (ma & 1 != 0) assertEq(ab, 0, "F5 a veto anywhere vetoes the batch");
                assertLe(ab, aa, "F6 depth monotone");
            }
        }
    }

    function test_MaskIsTheCFileMask() public view {
        // spot checks against values the C harness prints implicitly
        assertEq(h.mask(0x00), 16);
        assertEq(h.mask(0x01), 17);
        assertEq(h.mask(0x04), 18);
        assertEq(h.mask(0x10), 20);
        assertEq(h.mask(0xFF), 23);
    }
}
