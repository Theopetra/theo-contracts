// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TheopetraERC20Mock is ERC20 {
    constructor() ERC20("Theopetra", "THEO") {}

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        return true;
    }
}