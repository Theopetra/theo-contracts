// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.7.5;

import "./IERC20.sol";

interface IFounderVesting {
    event PayeeAdded(address account, uint256 shares);
    event PaymentReleased(address to, uint256 amount);
    event ERC20PaymentReleased(IERC20 indexed token, address to, uint256 amount);
    event PaymentReceived(address from, uint256 amount);

    function getTotalShares() external view returns (uint256);
    function getTotalReleased() external view returns (uint256);
    function getTotalReleased(IERC20 token) external view returns (uint256);
    function getShares(address account) external view returns (uint256);
    function getReleased(address account) external view returns (uint256);
    function getReleased(IERC20 token, address account) external view returns (uint256);
    function release(address payable account) external;
    function release(IERC20 token, address account) external;
}
