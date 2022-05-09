// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TheopetraERC20Mock is ERC20 {
    constructor() ERC20("Theopetra", "THEO") {}

    function mint(address to, uint256 value) public virtual {
        _mint(to, value);
    }

    function burnFrom(address from, uint256 amount) public virtual {
        _burn(from, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}
