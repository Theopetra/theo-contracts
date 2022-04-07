// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.7.5;

import "../Interfaces/IYieldReporter.sol";

contract YieldReporterMock is IYieldReporter {
    function lastYield() external view override returns (int256) {
        return 15_000_000_000;
    }

    function currentYield() external view override returns (int256) {
        return 10_000_000_000;
    }

    function getYieldById(uint256 id) external view override returns (int256) {
        return 10_000_000_000;
    }

    function reportYield(int256 _amount) external override returns (uint256) {
        return 10_000_000_000;
    }
}
