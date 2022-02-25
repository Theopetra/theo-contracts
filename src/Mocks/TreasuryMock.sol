// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.5;

contract TreasuryMock {
    function baseSupply() external view returns (uint256) {
        return 1000000;
    }
}
