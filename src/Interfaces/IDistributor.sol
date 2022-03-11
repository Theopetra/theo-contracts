// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.7.5;

interface IDistributor {
    function distribute() external returns (bool);

    function nextRewardAt(uint256 _rate) external view returns (uint256);

    function nextRewardFor(address _recipient) external view returns (uint256);

    function addRecipient(address _recipient, uint256 _rewardRate) external;

    function removeRecipient(uint256 _index, address _recipient) external;

    function setAdjustment(
        uint256 _index,
        bool _add,
        uint256 _rate,
        uint256 _target
    ) external;
}
