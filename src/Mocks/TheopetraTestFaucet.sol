// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "../Theopetra/TheopetraERC20.sol";
import "../Libraries/SafeERC20.sol";

contract TheopetraTestFaucet {

    using SafeERC20 for IERC20;

    uint256 immutable dispenseAmount = 1000000000000000;
    uint256 immutable dispenseEthAmount = 1000000000000000000;
    address immutable token = 0xfAc0403a24229d7e2Edd994D50F5940624CBeac2;

    function dispense() public returns(bool) {
        require(IERC20(token).balanceOf(address(this)) >= dispenseAmount, "Faucet is empty.");
        require(this.balance() >= dispenseEthAmount);
        address recipient = msg.sender;
        IERC20(token).safeTransfer(recipient, dispenseAmount);
        (bool success, ) = 
            recipient.call{value: dispenseEthAmount}("");
            require(success, "Transfer failed.");
        return true;
    }

    function balance() public view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    receive() external payable {}

}