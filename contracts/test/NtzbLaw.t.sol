// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {NtzbLawHarness} from "../contracts/experimental/NtzbLaw.sol";
import {CrossingLawHarness} from "../contracts/CrossingLaw.sol";

/// @notice Evaluation of the author's candidate kernel. These tests pin down what it DOES
///         (so the evaluation is reproducible), not what an escrow would want.
contract NtzbLawTest is Test {
    NtzbLawHarness n;
    CrossingLawHarness c;

    function setUp() public {
        n = new NtzbLawHarness();
        c = new CrossingLawHarness();
    }

    // plain-language restatement: first set bit among bits 1..6, plus 4 when (x-7) has its
    // first set bit among bits 1..7 at index >= 4
    function plain(uint256 x) internal pure returns (uint8) {
        x &= 255;
        uint8 first = 0;
        for (uint8 b = 1; b <= 6; b++) {
            if ((x >> b) & 1 == 1) {
                first = b;
                break;
            }
        }
        uint256 y;
        unchecked {
            y = (x - 7) & 254;
        }
        uint8 fb = 0;
        for (uint8 b = 1; b <= 7; b++) {
            if ((y >> b) & 1 == 1) {
                fb = b;
                break;
            }
        }
        return (fb >= 4 ? 4 : 0) + first;
    }

    function test_Exhaustive_MatchesPlainRestatement_AndC() public view {
        uint256[8] memory part;
        for (uint256 x = 0; x < 256; x++) {
            uint8 a = n.act(x);
            assertEq(a, plain(x), "branchless == plain");
            part[a]++;
        }
        // the partition the C harness prints
        assertEq(part[0], 4);
        assertEq(part[1], 113);
        assertEq(part[2], 64);
        assertEq(part[3], 17);
        assertEq(part[4], 16);
        assertEq(part[5], 23);
        assertEq(part[6], 4);
        assertEq(part[7], 15);
    }

    function testFuzz_Totality(uint256 x) public view {
        uint8 a = n.act(x);
        assertLe(a, 7);
        assertEq(a, n.act(x & 0xFF), "depends on the low byte only");
    }

    /// @notice the facts the evaluation rests on, on the escrow's bit layout
    function test_EscrowSituations_Facts() public view {
        // "no blocker" on bytes that carry a hazard at bit 0 or bit 7
        assertEq(n.act(0x01), 0, "UNFUNDED -> no blocker");
        assertEq(n.act(0x80), 0, "THROTTLED -> no blocker");
        assertEq(n.act(0x81), 0, "UNFUNDED+THROTTLED -> no blocker");
        assertEq(c.rule(0x01), 0);
        assertEq(c.rule(0x80), 2);
        // a veto byte escalated to a late blocker by the (x-7) term
        assertEq(n.act(0x21), 5);
        assertEq(c.rule(0x21), 0);
        // two blockers produce a HIGHER act than either alone
        assertEq(n.act(0x08), 3);
        assertEq(n.act(0x10), 4);
        assertEq(n.act(0x18), 7);
        // the size-5 expression: two identical hazards cancel
        assertEq(n.expr5(0x808000), 0);
        assertEq(n.expr5(0x000101), 0);
        assertEq(n.expr5(0x000001), 0xFF);
    }

    function test_Gas_SideBySide() public view {
        uint256 g0 = gasleft();
        n.act(0x14);
        uint256 gN = g0 - gasleft();
        g0 = gasleft();
        c.rule(0x14);
        uint256 gC = g0 - gasleft();
        console.log("GAS ntzb.act(0x14)       ", gN);
        console.log("GAS crossing.rule(0x14)  ", gC);
    }
}
