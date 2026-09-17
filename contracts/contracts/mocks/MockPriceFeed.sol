// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAggregatorV3} from "../interfaces/ISettlementEscrow.sol";

/// @notice Chainlink-shaped USD price feed with 8 decimals. `updatedAt == 0` means "now".
contract MockPriceFeed is IAggregatorV3, Ownable {
    int256 private _answer = 1e8;
    uint256 private _updatedAt; // 0 => block.timestamp at read
    uint80 private _round = 1;

    event AnswerSet(int256 answer, uint256 updatedAt);

    constructor(address operator) Ownable(operator) {}

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function setAnswer(int256 answer) external onlyOwner {
        _answer = answer;
        _round++;
        emit AnswerSet(answer, _updatedAt);
    }

    function setUpdatedAt(uint256 updatedAt) external onlyOwner {
        _updatedAt = updatedAt;
        emit AnswerSet(_answer, updatedAt);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        uint256 at = _updatedAt == 0 ? block.timestamp : _updatedAt;
        return (_round, _answer, at, at, _round);
    }
}
