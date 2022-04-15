// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./IERC20.sol";

interface IFounderVesting {
    event PayeeAdded(address account, uint256 shares);
    event PaymentReleased(address to, uint256 amount);
    event ERC20PaymentReleased(IERC20 indexed token, address to, uint256 amount);
    event PaymentReceived(address from, uint256 amount);

    // receive() external payable;
    function totalShares() external view returns (uint256);
    function totalReleased() external view returns (uint256);
    function totalReleased(IERC20 token) external view returns (uint256);
    function shares(address account) external view returns (uint256);
    function released(address account) external view returns (uint256);
    function released(IERC20 token, address account) external view returns (uint256);
    function payee(uint256 index) external view returns (address);
    function release(address payable account) external;
    function release(IERC20 token, address account) external;
}
