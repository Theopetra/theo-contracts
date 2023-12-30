// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

import "../Interfaces/IWETH9.sol";
import "../Interfaces/IBondDepository.sol";
import "../Interfaces/IWhitelistBondDepository.sol";

import "../Types/Signed.sol";

contract WethHelper is Signed {
    IWETH9 public weth;
    IWhitelistBondDepository[] public depoList;

    constructor(
        address _weth,
        ITheopetraAuthority _authority,
        IWhitelistBondDepository[] memory _bondDepos
    ) TheopetraAccessControlled(_authority) {
        weth = IWETH9(_weth);
        for (uint256 i=0; i < _bondDepos.length; ++i) {
            depoList.push(_bondDepos[i]);
        }
    }

    /**
     * @notice             Deposit to WETH, and subsequently deposit to the relevant Bond Depository
     * @dev                When the address of the Public Pre-List bond depository is non-zero (as set by `setPublicPreList`),
     *                     and `_isWhitelist` is true, then `deposit` will be called on the Public Pre-List
     *                     (as oposed to the Private Whitelist bond depository)
     * @param _id          the id of the bond market into which a deposit should be made
     * @param _maxPrice    the maximum price at which to buy
     * @param _user        the recipient of the payout
     * @param _referral    the front end operator address
     * @param _index       the index of the depo address 
     * @param _isWhitelist bool, true if the bond depository is the whitelist bond depo or public pre-list bond depo
     * @param signature    the signature for verification of a whitelisted depositor
     */
    function deposit(
        uint256 _id,
        uint256 _maxPrice,
        address _user,
        address _referral,
        uint256 _index,
        bool _isWhitelist,
        bytes calldata signature
    ) public payable {
        require(msg.value > 0, "No value");
        require(_index <= depoList.length, "Depo does not exist");

        weth.deposit{ value: msg.value }();
        weth.approve(address(depoList[_index]), msg.value);

        if (_isWhitelist) {
            verifySignature("", signature);
            weth.approve(address(depoList[_index]), msg.value);
            depoList[_index].deposit(_id, msg.value, _maxPrice, _user, _referral, signature);
        } else {
            weth.approve(address(depoList[_index]), msg.value);
            depoList[_index].deposit(_id, msg.value, _maxPrice, _user, _referral, signature);
        }
    }

    /**
     * @notice             Add an address to the depository list
     * @dev                See also `deposit` method
     * @param _publicPreList          the address of the Public Pre-List Bond Depository Contract
     */
    function addDepo(address _publicPreList) external onlyGovernor {
        depoList.push(IWhitelistBondDepository(_publicPreList));
    }

    function removeDepo(uint256 index) external onlyGovernor {
        require(index < depoList.length, "Index does not exist");
        depoList[index] = depoList[depoList.length - 1];
        depoList.pop();
    }
}
