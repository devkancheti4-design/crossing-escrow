// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Takes 1% on every transfer (not on mint/burn). Used to test UNFUNDED.
contract FeeOnTransferToken is ERC20 {
    address public immutable sink;

    constructor(address sink_) ERC20("Fee Token", "FEE") {
        sink = sink_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = value / 100;
        super._update(from, sink, fee);
        super._update(from, to, value - fee);
    }
}
