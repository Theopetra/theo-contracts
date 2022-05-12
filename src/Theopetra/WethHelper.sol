// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

import "../Interfaces/IWETH9.sol";
import "../Interfaces/IBondDepository.sol";
import "../Interfaces/IWhitelistBondDepository.sol";

import "../Types/Signed.sol";

contract WethHelper is Signed {
    IWETH9 public weth;
    IBondDepository public bondDepo;
    IWhitelistBondDepository public whitelistBondDepo;

    constructor(
        address _weth,
        ITheopetraAuthority _authority,
        address _bondDepo,
        address _whitelistBondDepo
    ) TheopetraAccessControlled(_authority) {
        weth = IWETH9(_weth);
        bondDepo = IBondDepository(_bondDepo);
        whitelistBondDepo = IWhitelistBondDepository(_whitelistBondDepo);
    }

    function deposit(
        uint256 _id,
        uint256 _maxPrice,
        address _user,
        address _referral,
        bool _autoStake,
        bool _isWhitelist,
        bytes calldata signature
    ) public payable {
        require(msg.value > 0, "No value");

        weth.deposit{ value: msg.value }();

        if (_isWhitelist) {
            verifySignature("", signature);
            weth.approve(address(whitelistBondDepo), msg.value);
            whitelistBondDepo.deposit(_id, msg.value, _maxPrice, _user, _referral, signature);
        } else {
            weth.approve(address(bondDepo), msg.value);
            bondDepo.deposit(_id, msg.value, _maxPrice, _user, _referral, _autoStake);
        }
    }
}
