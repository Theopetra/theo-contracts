pragma solidity ^0.8.9;

contract AggregatorMockETH {
    /**
     * Returns the latest price
     */
    function latestRoundData() public pure returns (
        uint80,
        int,
        uint,
        uint,
        uint80
    ) {
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
