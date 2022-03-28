// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.5;

import "../Interfaces/ITHEO.sol";

contract TreasuryMock {
    event Minted(address indexed caller, address indexed recipient, uint256 amount);

    ITHEO public immutable THEO;

    constructor(address _theo) {
        THEO = ITHEO(_theo);
    }

    function mint(address _recipient, uint256 _amount) external {
        THEO.mint(_recipient, _amount);
        emit Minted(msg.sender, _recipient, _amount);
    }

    function baseSupply() external pure returns (uint256) {
        return 10000000000000;
    }

    function deltaTokenPrice() public view returns (int256) {
        return 100_000_000; // 10%. 0.01 (9 decimals)
    }

    function deltaTreasuryYield() public view returns (int256) {
        return 200_000_000; // 20%. 0.02 (9 decimals)
    }

    function tokenValue(address _token, uint256 _amount) public view returns (uint256 value_) {
        return _amount * 242674; // To match valuation returned from BondingCalculatorMock
    }
}
