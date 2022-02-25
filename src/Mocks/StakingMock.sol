// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.5;

contract StakingMock {
    function stake(
        address _to,
        uint256 _amount,
        bool _rebasing,
        bool _claim
    ) external view returns (uint256) {
        return _amount;
    }
}
