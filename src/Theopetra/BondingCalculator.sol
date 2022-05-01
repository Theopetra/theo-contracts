//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.5;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import "../Interfaces/IERC20Metadata.sol";

import "hardhat/console.sol";

contract TwapGetter {
    address public immutable factory;
    address public immutable theo;
    address public immutable performanceToken;
    uint32 public immutable secondsAgo;
    uint24 public immutable fee;

    constructor(
        address _factory,
        address _theo,
        address _performanceToken,
        uint24 _fee,
        uint32 _secondsAgo
    ) {
        factory = _factory;
        theo = _theo;
        performanceToken = _performanceToken;
        fee = _fee;

        require(_secondsAgo != 0, "No time period provided");
        secondsAgo = _secondsAgo;
    }


    function valuation(address tokenIn, uint128 _amount)
        external
        view
        returns (uint256 amountOut)
    {
        // require(tokenIn == token0 || tokenIn == token1, "Invalid token");
        address tokenOut = tokenIn == theo ? performanceToken : theo;

        address _pool = IUniswapV3Factory(factory).getPool(
            tokenIn,
            tokenOut,
            fee
        );
        require(_pool != address(0), "Pool does not exist");

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(_pool).observe(
            secondsAgos
        );

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        int24 tick = int24(tickCumulativesDelta / secondsAgo);
        // Always round to negative infinity
        if (
            tickCumulativesDelta < 0 && (tickCumulativesDelta % secondsAgo != 0)
        ) tick--;

        amountOut = OracleLibrary.getQuoteAtTick(
            tick,
            _amount,
            tokenIn,
            tokenOut
        );
    }
}
