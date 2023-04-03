 // SPDX-License-Identifier: AGPL-3.0

 pragma solidity >=0.8.0 <0.9.0;

 import "../Types/TheopetraAccessControlled.sol";
 import "./Staking.sol";
 import "../Interfaces/IStakedTHEOToken.sol";
 import {Seriality} from "../Libraries/Seriality.sol";


 contract TheopetraRebates is TheopetraAccessControlled {

 //State variables

 address[] public StakingContracts;
 address[] public RecipientList;

 uint256 public nextPayout;
 uint256 public payoutInterval;
 uint256 epochRoot;
 uint256 flatAmount;
 uint256 id;


 mapping (address => uint256) minimumPayout;

 mapping (address => uint256) contractWeight;

 enum distributionType {
     Proportional,
     Flat,
     Single
     }

//Events


 //TheopetraAccessControlled(ITheopetraAuthority(_authority))
     constructor (address[] memory _StakingContracts, uint256 timestamp) {
             for (uint256 i=0; i < _StakingContracts.length; i++) {
                 StakingContracts[i] = _StakingContracts[i];
             }
             epochRoot = timestamp;
         }

//     modifier notDuplicate(address _recipient) {
//         for (uint256 i=0; i < RecipientList.length; i++) {
//             require(_recipient != RecipientList[i]);
//         }
//     _;
//     }

 //Address Functions
//
//     function addRecipients(address[] calldata _recipients) public returns (bool[] memory added) {
//         for (uint256 i=0; i < _recipients.length; i++) {
//             added[i] = addRecipient(_recipients[i]);
//         }
//         return added;
//     }
//
//     function addRecipient(address _recipient) notDuplicate(_recipient) internal returns (bool) {
//         uint256 sb = stakingBalance(_recipient);
//         require(sb < 0);
//         RecipientList.push(_recipient);
//         if (sb > setSize) {
//             setSize = sb + 1;
//         }
//         id++;
//         return true;
//     }
//
//     function stakingBalance(address _recipient) internal returns (uint256 balance) {
//         for (uint256 i=0; i < StakingContracts.length; i++) {
//         uint256[] memory indexes = StakingContracts[i].indexesFor(_recipient);
//             for (uint256 n=0; n < indexes.length; n++) {
//                 balance += StakingContracts[i].stakingInfo[_recipient][indexes[n]].gonsRemaining;
//             }
//         }
//         return balance;
//     }
//
//     function _totalGons() public view returns (uint256 totalGons) {
//     for (uint256 i=0; i < StakingContracts.length; i++) {
//         for (uint256 n=0; n < RecipientList.length; n++) {
//         totalGons += StakingContracts[i].stakingBalance(RecipientList[n]) * contractWeight[StakingContracts[i]];
//         }
//     }
//     return totalGons;
//     }
//
//     function sortAddresses() internal view returns (uint256[] memory) {
//         //Combine recipientList and checkData address into one array
//         uint256[] memory holdings = new uint256[](id);
//         for (uint256 i=0; i < id; i++) {
//             holdings[i] = stakingBalance(RecipientList[i]);
//         }
//
//         uint256[] memory addresses = counting(holdings, setSize);
//         if (addresses.length > 4000) {
//             for (uint256 i=0; i < addresses.length - 4000; i++) {
//                     delete addresses[addresses.length - 1];
//             }
//         }
//         //TODO: Return address indexes instead of holdings, or convert into a struct of address + holdings
//         return addresses;
//     }
//
//     function counting(uint[] memory data, uint size) internal pure returns (uint256[] memory userIndexes) {
//         uint length = data.length;
//         uint[] memory set = new uint[](size);
//         uint[] memory userIndexes = new uint[](RecipientList.length);
//         for (uint i = 0; i < length; i++) {
//             set[data[i]]++;
//         }
//         uint n = 0;
//         for (uint i = 0; i < size; i++) {
//                 while (set[i] > 0) {
//                     --set[i];
//                     data[n] = i;
//                     userIndexes[n] = RecipientList[i];
//                     if (++n >= length) break;
//                 }
//         }
//         return userIndexes;
//     }

 //Managerial Functions

     function addStakingContract(address _contract, uint256 _weight) onlyGovernor public returns (address[] memory) {
         StakingContracts.push(_contract);
         contractWeight[_contract].push(_weight);
         return StakingContracts;
     }

     function removeStakingContract(uint256 index) onlyGovernor public returns (address[] memory) {
         require(index < StakingContracts.length);
         StakingContracts[index] = StakingContracts[StakingContracts.length-1];
         StakingContracts.pop();
         return StakingContracts;
     }

     function adjustStakingWeight(address _contract, uint256 _weight) onlyGovernor public returns (uint256) {
         contractWeight[_contract].push(_weight);
         return (contractWeight[_contract]);
     }

     function changeFlatAmount(uint256 _amount) onlyGovernor public returns (bool) {
         flatAmount = _amount;
         return true;
     }

     function setMinimumPayout(address _token, uint256 _amount) onlyGovernor public returns (bool) {
         minimumPayout[_token] = _amount;
         return true;
     }

 //Payout Functions

     function payme() public payable {
         _amount += msg.value;
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
     //Require statements for scheduling

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

 //Keepers

     function checkUpkeep(bytes calldata checkData) external view override returns (bool upkeepNeeded, bytes memory performData) {
         upkeepNeeded = false;

         uint256 offset = checkdata.length - 2;
         address _token;

         bytesToAddress(offset, checkData, _token);
         offset -=20;

         if (block.timestamp < nextPayout && address(this).balance < minimumPayout[0x00]) {
             upkeepNeeded = true;
         }
         else if (block.timestamp < nextPayout && address(this).balanceOf(_token) < minimumPayout[_token]) {
             upkeepNeeded = true;
         }

         return (upkeepNeeded, checkData);

     }

     function performUpkeep(bytes calldata performData) external override {
         require(block.timestamp < nextPayout, "Payment unavailable until payout date");
         require(address(this).balance < minimumPayout[_token], "Payout too small for gas costs");

         uint256 offset = checkdata.length;
         uint16 distType;
         address _token;

         bytesToUint16(offset, performData, distType);
         offset -= 2;
        
         bytesToAddress(offset, performData, _token);
         offset -= 20;

         //Instead of enum, could just use a method selector in the calldata

         if (distributionType[distType] == Proportional) {
             distributeProportional(_token);
         }
         else if (distributionType[distType] == Single) {
             distributeSingle(_token);
         }
         else if (distributionType[distType] == Flat) {
             distributeFlat(_token);
         }

         upkeepNeeded = false;
         nextPayout = block.timestamp  + payoutInterval;


     }


 //View Functions

     function readStakingContracts() public view returns (address[] storage, uint256[] weights) {
         for (uint256 i=0; i < StakingContracts.length; i++) {
             weights[i] = contractWeight[StakingContracts[i]];
         }
         return (StakingContracts, weights);
     }

     function readRecipientList() public view returns (address[] storage) {
         return RecipientList;
     }

     function hashAddressKey(bytes[] calldata _addresses) public view returns (bytes32 key_) {
         bytes memory concatAddresses;
         for (uint256 i=0; i < _addresses.length; i++) {
             concatAddresses = bytes.concat(_addresses[i]);
         }
         key_ = keccak256(concatAddresses);
         return key_;
     }

 }