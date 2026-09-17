// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISettlementOracle} from "../interfaces/ISettlementEscrow.sol";

/// @notice The oracle operator validates an off-chain proof and records it on-chain.
contract MockSettlementOracle is ISettlementOracle, Ownable {
    mapping(uint256 id => bool) private _confirmed;

    event Confirmed(uint256 indexed id, bool confirmed);

    constructor(address operator) Ownable(operator) {}

    function setConfirmed(uint256 id, bool value) external onlyOwner {
        _confirmed[id] = value;
        emit Confirmed(id, value);
    }

    function isConfirmed(uint256 id) external view returns (bool) {
        return _confirmed[id];
    }
}

/// @notice An oracle that always reverts: "could not be reached".
contract RevertingOracle is ISettlementOracle {
    function isConfirmed(uint256) external pure returns (bool) {
        revert("oracle down");
    }
}

/// @notice An oracle that burns all forwarded gas: the measurement's gas cap must contain it.
contract GasGuzzlerOracle is ISettlementOracle {
    function isConfirmed(uint256) external view returns (bool) {
        uint256 x = 1;
        while (x != 0) {
            x = uint256(keccak256(abi.encode(x, gasleft()))) | 1;
        }
        return false;
    }
}
