// SPDX-License-Identifier: AGPL-1.0

pragma solidity 0.7.5;

interface IOwnable {
    function manager() external view returns (address);

    function renounceManagement() external;

    function pushManagement(address newOwner_) external;

    function pullManagement() external;
}
