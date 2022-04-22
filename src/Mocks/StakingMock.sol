// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.5;

import "../Interfaces/IERC20.sol";
import "../Libraries/SafeERC20.sol";

contract StakingMock {
    using SafeERC20 for IERC20;

    IERC20 public immutable THEO;
    uint256 public claimIndexCount;

    constructor(address _theo) {
        THEO = IERC20(_theo);
    }

    function stake(
        address _to,
        uint256 _amount,
        bool _claim
    ) external returns (uint256, uint256) {
        THEO.safeTransferFrom(msg.sender, address(this), _amount);
        claimIndexCount += 1;
        return (_amount, claimIndexCount);
    }

    function pushClaim(address _to, uint256 _index) external {}

    function pushClaimForBond(address _to, uint256 _index) external returns (uint256 newIndex_) {
        return 0;
    }
}
