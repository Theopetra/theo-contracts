// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UsdcERC20Mock is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
}
