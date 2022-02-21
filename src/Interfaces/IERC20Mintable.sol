// SPDX-License-Identifier: AGPL-1.0

pragma solidity 0.8.9;

interface IERC20Mintable {
  function mint( uint256 amount_ ) external;

  function mint( address account_, uint256 ammount_ ) external;
}

