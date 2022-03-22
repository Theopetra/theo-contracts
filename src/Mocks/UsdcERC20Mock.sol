// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UsdcERC20Mock is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 value) public virtual {
        _mint(to, value);
    }

    /**
     * @dev Sets {decimals} to a value other than the default one of 18.
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
