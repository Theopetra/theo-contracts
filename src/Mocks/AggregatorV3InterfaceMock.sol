// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceConsumerV3Mock {
    function getLatestPrice(address priceFeedAddress) public view returns (int256, uint8) {
        return (287908444994, 8);
    }
}
