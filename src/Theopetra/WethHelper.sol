// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "../Types/ERC20.sol";

import "../Interfaces/IWETH9.sol";
import "../Interfaces/IBondDepository.sol";

import "hardhat/console.sol";

contract WethHelper {
    IWETH9 public weth;
    IBondDepository public bondDepo;

    mapping(address => uint256) public balances;

    constructor(address _weth, address _bondDepo) {
        weth = IWETH9(_weth);
        bondDepo = IBondDepository(_bondDepo);
    }

    function deposit(
        uint256 _id,
        uint256 _maxPrice,
        address _user,
        address _referral,
        bool _autoStake
    ) public payable {
        require(msg.value > 0, "No value");

        weth.deposit{ value: msg.value }();

        weth.approve(address(bondDepo), msg.value);
        bondDepo.deposit(_id, msg.value, _maxPrice, _user, _referral, _autoStake);
    }
}
