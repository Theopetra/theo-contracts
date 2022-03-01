// SPDX-License-Identifier: AGPL-1.0

pragma solidity 0.7.5;

interface ITHEOERC20 {
    function burnFrom(address account_, uint256 amount_) external;
}
