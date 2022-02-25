// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.5;

contract TreasuryMock {
    event Minted(address indexed caller, address indexed recipient, uint256 amount);

    function mint(address _recipient, uint256 _amount) external {
        emit Minted(msg.sender, _recipient, _amount);
    }

    function baseSupply() external pure returns (uint256) {
        return 1000000;
    }
}
