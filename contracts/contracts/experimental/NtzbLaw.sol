// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title NtzbLaw — EXPERIMENTAL candidate kernel supplied by the author, ported for evaluation only.
/// @notice NOT used by SettlementEscrow. Exists so the candidate can be measured on-chain
///         (gas, totality) and compared with CrossingLaw on the escrow's own situations.
///
///   ntzb(v) = index of the lowest set bit of (v & 254); ntzb(0) := 0   ("which blocking observation came first")
///   act(x)  = (4 & ntzb(x - 7)) + ntzb(x + (x & 128))
///   expr5(x)= 255 & ((x >> 8) + ((x >> 16) - x))                      == (byte1 + byte2 - byte0) mod 256
library NtzbLaw {
    /// @dev branchless: (v & 254) | 256 is never zero, so the lowest set bit has index 1..8; & 7 maps 8 -> 0
    function ntzb(uint256 v) internal pure returns (uint256) {
        unchecked {
            uint256 w = (v & 254) | 256;
            uint256 low = w & (~w + 1);
            uint256 idx = ((low >> 1) & 1) * 1 + ((low >> 2) & 1) * 2 + ((low >> 3) & 1) * 3 + ((low >> 4) & 1) * 4
                + ((low >> 5) & 1) * 5 + ((low >> 6) & 1) * 6 + ((low >> 7) & 1) * 7 + ((low >> 8) & 1) * 8;
            return idx & 7;
        }
    }

    function act(uint256 x) internal pure returns (uint8) {
        unchecked {
            return uint8((4 & ntzb(x - 7)) + ntzb(x + (x & 128)));
        }
    }

    function expr5(uint256 x) internal pure returns (uint256) {
        unchecked {
            return 255 & ((x >> 8) + ((x >> 16) - x));
        }
    }
}

contract NtzbLawHarness {
    function act(uint256 x) external pure returns (uint8) {
        return NtzbLaw.act(x);
    }

    function ntzb(uint256 v) external pure returns (uint256) {
        return NtzbLaw.ntzb(v);
    }

    function expr5(uint256 x) external pure returns (uint256) {
        return NtzbLaw.expr5(x);
    }
}
