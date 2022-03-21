// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.9;

interface IPriceConsumerV3 {
    function getLatestPrice(address priceFeedAddress) external view returns (int256, uint8);
}
