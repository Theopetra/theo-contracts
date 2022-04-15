// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TheopetraERC20Mock is ERC20 {
    uint256 private totalSupplyOverride = 0;

    constructor() ERC20("Theopetra", "THEO") {}

    function mint(address to, uint256 value) public virtual {
        _mint(to, value);
    }

    function setTotalSupply(uint256 supply) public {
        totalSupplyOverride = supply;
    }

    function totalSupply() public view override returns (uint256) {
        if(totalSupplyOverride > 0) {
            return totalSupplyOverride;
        }
        return super.totalSupply();
    }
}
