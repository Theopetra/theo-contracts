// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../Types/TheopetraAccessControlled.sol";
import "../Interfaces/IYieldReporter.sol";

/**
 * @title Theopetra Yield Reorter
 */

contract TheopetraYieldReporter is IYieldReporter, TheopetraAccessControlled {

    /* ======== STATE VARIABLES ======== */

    mapping(uint256 => int256) private yields;
    uint256 private currentIndex;

    string private OUT_OF_BOUNDS = "OUT_OF_BOUNDS";

    /* ======== CONSTRUCTOR ======== */

    constructor(
        ITheopetraAuthority _authority
    ) TheopetraAccessControlled(_authority) {
        // initialize yield 0 to 0
        currentIndex = 0;
        yields[currentIndex] = 0;
    }

    function decimals() external pure returns (int256) {
        return 9;
    }

    function lastYield() external view returns (int256) {
        return currentIndex > 0 ? yields[currentIndex - 1] : int256(0);
    }

    function getCurrentIndex() external view returns (uint256) {
        return currentIndex;
    }

    function currentYield() external view returns (int256) {
        // constructor and solidity defaults allow this to return 0 before
        // any yields are reported
        return yields[currentIndex];
    }

    function getYieldById(
        uint256 id
    ) external view returns (int256) {
        // don't allow requiring a yield past the current index
        require(id > currentIndex, OUT_OF_BOUNDS);
        return yields[id];
    }

    function reportYield(
        int256 _amount
    ) external onlyPolicy returns (uint256) {
        yields[++currentIndex] = _amount;
        emit ReportYield(currentIndex, _amount);
        return currentIndex;
    }
}
