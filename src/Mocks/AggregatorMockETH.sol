// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.9;

/**
 * Network: Rinkeby
 * Aggregator: ETH/USD
 * Address: 0x8A753747A1Fa494EC906cE90E9f37563A8AF630e
 *
 */
contract AggregatorMockETH {
    /**
     * Returns the latest price
     */
    function latestRoundData()
        public
        pure
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        // (
        //     uint80 roundID,
        //     int price,
        //     uint startedAt,
        //     uint timeStamp,
        //     uint80 answeredInRound
        // )
        return (1, 287908444994, 0, 0, 1);
    }

    function decimals() public pure returns (uint8) {
        return 8;
    }
}
