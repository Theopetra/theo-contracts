// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.9;

/**
 * Network: Rinkeby
 * Aggregator: USDC/USD
 * Address: 0xa24de01df22b63d23Ebc1882a5E3d4ec0d907bFB
 *
 */
contract AggregatorMockUSDC {
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
        return (1, 100017574, 0, 0, 1);
    }

    function decimals() public pure returns (uint8) {
        return 8;
    }
}
