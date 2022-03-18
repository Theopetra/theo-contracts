// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceConsumerV3 {
    /**
     * Returns the latest price
     */
    function getLatestPrice(address priceFeedAddress) public view returns (int, uint8) {
        (
            uint80 roundID,
            int price,
            uint startedAt,
            uint timeStamp,
            uint80 answeredInRound
        ) = AggregatorV3Interface(priceFeedAddress).latestRoundData();

        uint8 decimals = AggregatorV3Interface(priceFeedAddress).decimals();

        return (price, decimals);
    }
}
