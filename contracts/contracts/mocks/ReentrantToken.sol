// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice An ERC20 that, on transfer OUT of the attacker-chosen target, tries to re-enter
///         the escrow with an arbitrary call. Records whether the re-entry succeeded.
contract ReentrantToken is ERC20 {
    address public target; // the escrow
    bytes public payload; // the re-entrant call
    uint256 public attempts;
    uint256 public successes;
    bool public armed;

    constructor() ERC20("Reentrant", "RNT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from == target) {
            armed = false; // one attempt per arming
            attempts++;
            (bool ok,) = target.call(payload);
            if (ok) successes++;
        }
    }
}
