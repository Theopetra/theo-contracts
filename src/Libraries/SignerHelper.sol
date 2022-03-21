// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.0;

contract SignerHelper {
    function createHash(string memory _data, address _to, address _contractAddress, string calldata _secret) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_contractAddress, _to, _data, _secret));
    }
}
