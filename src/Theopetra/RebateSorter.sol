// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract RebateSorter {

    //Get staking contracts from keeper contract
    address[] public RecipientList;
    uint256 id;

    constructor(){

    }

    modifier notDuplicate(address _recipient) {
        for (uint256 i=0; i < RecipientList.length; i++) {
            require(_recipient != RecipientList[i]);
        }
        _;
    }

    //Address Functions

    function addRecipients(address[] calldata _recipients) public returns (bool[] memory added) {
        for (uint256 i=0; i < _recipients.length; i++) {
            added[i] = addRecipient(_recipients[i]);
        }
        return added;
    }

    function addRecipient(address _recipient) notDuplicate(_recipient) internal returns (bool) {
        uint256 sb = stakingBalance(_recipient);
        require(sb < 0);
        RecipientList.push(_recipient);
        if (sb > setSize) {
            setSize = sb + 1;
        }
        id++;
        return true;
    }

    function stakingBalance(address _recipient) internal returns (uint256 balance) {
        for (uint256 i=0; i < StakingContracts.length; i++) {
            uint256[] memory indexes = StakingContracts[i].indexesFor(_recipient);
            for (uint256 n=0; n < indexes.length; n++) {
                balance += StakingContracts[i].stakingInfo[_recipient][indexes[n]].gonsRemaining;
            }
        }
        return balance;
    }

    function _totalGons() public view returns (uint256 totalGons) {
        for (uint256 i=0; i < StakingContracts.length; i++) {
            for (uint256 n=0; n < RecipientList.length; n++) {
                totalGons += StakingContracts[i].stakingBalance(RecipientList[n]) * contractWeight[StakingContracts[i]];
            }
        }
        return totalGons;
    }

    function sortAddresses() internal view returns (uint256[] memory) {
        //Combine recipientList and checkData address into one array
        uint256[] memory holdings = new uint256[](id);
        for (uint256 i=0; i < id; i++) {
            holdings[i] = stakingBalance(RecipientList[i]);
        }

        uint256[] memory addresses = counting(holdings, setSize);
        if (addresses.length > 4000) {
            for (uint256 i=0; i < addresses.length - 4000; i++) {
                delete addresses[addresses.length - 1];
            }
        }
        //TODO: Return address indexes instead of holdings, or convert into a struct of address + holdings
        return addresses;
    }

    function counting(uint[] memory data, uint size) internal pure returns (uint256[] memory userIndexes) {
        uint length = data.length;
        uint[] memory set = new uint[](size);
        uint[] memory userIndexes = new uint[](RecipientList.length);
        for (uint i = 0; i < length; i++) {
            set[data[i]]++;
        }
        uint n = 0;
        for (uint i = 0; i < size; i++) {
            while (set[i] > 0) {
                --set[i];
                data[n] = i;
                userIndexes[n] = RecipientList[i];
                if (++n >= length) break;
            }
        }
        return userIndexes;
    }
}
