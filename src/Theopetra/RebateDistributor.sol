// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../Types/TheopetraAccessControlled.sol";

contract RebateDistributor is TheopetraAccessControlled {
    constructor(){

    }

    receive() public payable {}

    function payTo(address to, uint256 amount) internal returns (bool) {
        (bool success,) = payable(to).call{value: amount}("");
        require(success, "Payment Failed");

        emit Rebate (
            to,
            amount
        );

        return true;
    }

    //TEST: Compatibility with other token types, especially ERC-721 and ERC-1155
    //Import erc interface?

    function payToERC(address _to, uint256 _amount, address _token) internal returns (bool) {
        (bool success,) = ERC20(_token).transfer(_to, _amount);
        require(success, "Payment Failed");

        emit Rebate (
            to,
            amount
        );

        return true;
    }

    //Review this function for security assumptions
    //Should the "to" address always be the governor address?

    function rescue(address _to, uint256 _amount, address _token) onlyGovernor public returns (bool) {
        if (_token == 0x00) {
            (bool success,) = payable(to).call{value: amount}("");
            require(success, "Payment Failed");
        }
        else {
            (bool success,) = ERC20(_token).transfer(_to, _amount);
            require(success, "Payment Failed");
        }
        return true;
    }

    //Distribution types need to be internal
    //Can make only reachable through delegate call from keeper contract
    //Require statements for scheduling
    //Separate functions for ETH cases instead of if/else (check gas cost)
    //Remove single, just use the flatRate set to 1 instead

    function distributeProportional(_token) public returns (bool) {

        require();

        uint256 totalGons = _totalGons();
        if (_token == 0x00) {
            uint256 totalPayout = address(this).balance;
        }
        else {
            uint256 totalPayout = address(this).balanceOf(_token);
        }

        //Should return staking balance array as well to avoid calling it twice
        address[] memory recipients = sortAddresses();

        for(uint256 i=0; i < id; i++) {
            payTo(recipients[i], (stakingBalance(recipients[i]) * totalPayout) / totalGons);
        }

        emit TotalRebate(
            totalPayout,
            recipients,
            block.timestamp
        );

        return true;
    }

    function distributeFlat(address _token) public returns (bool) {

        uint256 totalGons = _totalGons();

        if (_token == 0x00) {
            uint256 totalPayout = address(this).balance;
        }
        else {
            uint256 totalPayout = address(this).balanceOf(_token);
        }

        address[] memory recipients = sortAddresses();

        for(uint256 i=0; i < id; i++) {
            payTo(recipients[i], flatAmount);
        }

        emit TotalRebate(
            totalPayout,
            recipients,
            block.timestamp
        );

        return true;
    }

    function distributeSingle(address _token) public returns (bool) {

        uint256 totalGons = _totalGons();

        if (_token == 0x00) {
            uint256 totalPayout = address(this).balance;
        }
        else {
            uint256 totalPayout = address(this).balanceOf(_token);
        }

        address[] memory recipients = sortAddresses();

        for(uint256 i=0; i < id; i++) {
            payTo(recipients[i], 1);
        }

        emit TotalRebate(
            totalPayout,
            recipients,
            block.timestamp
        );

        return true;
    }
}
