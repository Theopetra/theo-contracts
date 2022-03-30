// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../Types/TheopetraAccessControlled.sol";
import "../Interfaces/IYieldReporter.sol";

/**
 * @title Theopetra Yield Reorter
 * @notice
 */

contract TheopetraYieldReporter is IYieldReporter, TheopetraAccessControlled {

    /* ======== STATE VARIABLES ======== */

    /**
     * @notice Theopetra reported yields by index
     */
    mapping(uint256 => int256) private yields;
    /**
     * @notice current yield ID
     */
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

    /**
     * @notice return the number of decimals expect in the fixed point yield representation (9)
     * @return uint256  number of decimals (9)
     */
    function decimals() external pure returns (int256) {
        return 9;
    }

    /**
     * @notice returns the previous yield value or 0 if no previous yield
     * @return int256  previous yield value
     */
    function lastYield() external view returns (int256) {
        return currentIndex > 0 ? yields[currentIndex - 1] : int256(0);
    }

    /**
     * @notice returns the current index value
     * @return uint256  current index value
     */
    function getCurrentIndex() external view returns (uint256) {
        return currentIndex;
    }

    /**
     * @notice returns the current yield value
     * @return int256  current yield value
     */
    function currentYield() external view returns (int256) {
        // constructor and solidity defaults allow this to return 0 before
        // any yields are reported
        return yields[currentIndex];
    }

    /**
     * @notice returns the yield value for a given index
     * @param  _id  index of yield to return
     * @return int256  yield value
     * @dev reverts if id is out of bounds
     */
    function getYieldById(
        uint256 _id
    ) external view returns (int256) {
        // don't allow requiring a yield past the current index
        require(_id <= currentIndex, OUT_OF_BOUNDS);
        return yields[_id];
    }

    /**
     * @notice reports a yield value
     * @param  _amount  yield value to report
     * @return uint256  index of the reported yield
     * @dev reverts if called by a non-policy address
     * @dev emits a ReportYield event
     */
    function reportYield(
        int256 _amount
    ) external onlyPolicy returns (uint256) {
        yields[++currentIndex] = _amount;
        emit ReportYield(currentIndex, _amount);
        return currentIndex;
    }
}
