// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract sTheoMock is ERC20 {
    constructor() ERC20("sTheopetra", "sTHEO") {}

    function mint(address to, uint256 value) public virtual {
        _mint(to, value);
    }

    /**
     * @notice    1-to-1 conversion of THEO to sTHEO
     */
    function balanceTo(uint256 _amount) external view returns (uint256) {
        return _amount;
    }
}
