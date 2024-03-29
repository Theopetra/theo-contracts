// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract sTheoMock is ERC20 {
    constructor() ERC20("sTheopetra", "sTHEO") {}

    function mint(address to, uint256 value) public virtual {
        _mint(to, value);
    }

    function gonsForBalance(uint256 amount) public view returns (uint256) {
        return amount;
    }

    function balanceForGons(uint256 gons) public view returns (uint256) {
        return gons;
    }

    function circulatingSupply() public view returns (uint256) {
        // 5e12 set to result in a sufficiently low slashing reward when unstaking so as
        // not to exceed available THEO balance in bond depo when testing with mocks
        return 1000000;
    }
}
