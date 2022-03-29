// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../Types/TheopetraAccessControlled.sol";
import "../Interfaces/IYieldReporter.sol";

/**
 * @title Theopetra Yield Reorter
 */

contract TheopetraYieldReporter is IYieldReporter, TheopetraAccessControlled {

    int256 private prevYield;
    int256 private currYield;


    constructor(
        ITheopetraAuthority _authority
    ) TheopetraAccessControlled(_authority) {
        // do nothing
    }

    function lastYield() external view returns (int256) {
        return prevYield;
    }

    function currentYield() external view returns (int256) {
        return currYield;
    }

    function getYieldById(uint256 id) external view returns (int256) {
        return 0;
    }

    function reportYield(int256 _amount) external onlyPolicy returns (int256) {
        return 0;
    }
}
