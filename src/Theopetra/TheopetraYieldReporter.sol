// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.10;

// import "../Types/TheopetraAccessControlled.sol";
import "../Interfaces/IYieldReporter.sol";

/**
 * @title Theopetra Yield Reorter
 */

contract TheopetraYieldReporter is IYieldReporter {

    constructor() {
        // do nothing
    }

    function lastYield() external view returns (int256) {
        return 0;
    }

    function currentYield() external view returns (int256) {
        return 0;
    }

    function getYieldById(uint256 id) external view returns (int256) {
        return 0;
    }

    function reportYield(int256 _amount) external returns (int256) {
        return 0;
    }
}
