// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.5;

import "../Interfaces/IERC20.sol";

contract StakingMock {
    // IERC20 public immutable THEO;
    
    // constructor(address _theo) {
    //   THEO = IERC20(_theo);
    // }
    
    function stake(
        address _to,
        uint256 _amount,
        bool _rebasing,
        bool _claim
    ) external view returns (uint256) {
        
        
        return _amount;
    }
}
