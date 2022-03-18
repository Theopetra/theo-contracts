// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceConsumerV3MockETH {

    AggregatorV3Interface internal priceFeed;

    constructor(address priceFeedAddress) {}

    function getLatestPrice() public view returns (int, uint8) {
        return (280325072985, 8);
    }
}
