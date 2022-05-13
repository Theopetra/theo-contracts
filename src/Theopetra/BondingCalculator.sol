// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import "../Interfaces/IERC20Metadata.sol";
import "../Interfaces/IBondCalculator.sol";
import "../Libraries/SafeCast.sol";

contract TwapGetter is IBondCalculator {
    using SafeCast for uint256;

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

    function valuation(address tokenIn, uint256 _amount) external view override returns (uint256 amountOut) {
        address tokenOut = tokenIn == theo ? performanceToken : theo;

        address _pool = IUniswapV3Factory(factory).getPool(tokenIn, tokenOut, fee);
        require(_pool != address(0), "Pool does not exist");

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(_pool).observe(secondsAgos);

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        int24 tick = int24(tickCumulativesDelta / secondsAgo);
        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % secondsAgo != 0)) tick--;

        uint128 amount_ = _amount.toUint128();
        amountOut = OracleLibrary.getQuoteAtTick(tick, amount_, tokenIn, tokenOut);
    }
}
