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
    address public immutable founderVesting;
    uint32 public immutable secondsAgo;
    uint24 public immutable fee;
    uint8 private constant DECIMALS = 9;

    string private constant REQUIRE_ERROR = "Address cannot be zero address";

    /**
     * @param _factory     address of the UniswapV3Factory
     * @param _theo        address of THEO token
     * @param _performanceToken    address of the token with which THEO will be paired
     * @param _founderVesting address of the Founder Vesting contract
     * @param _fee         the fee collected upon every swap in the pool, denominated in hundredths of a bip (i.e. 1e-6; e.g. 3000 for 0.3% fee tier);
     * @param _secondsAgo  the time range, in seconds, used for the twap
     */
    constructor(
        address _factory,
        address _theo,
        address _performanceToken,
        address _founderVesting,
        uint24 _fee,
        uint32 _secondsAgo
    ) {
        require(_factory != address(0), REQUIRE_ERROR);
        factory = _factory;
        require(_theo != address(0), REQUIRE_ERROR);
        theo = _theo;
        require(_performanceToken != address(0), REQUIRE_ERROR);
        performanceToken = _performanceToken;
        require(_founderVesting != address(0), REQUIRE_ERROR);
        founderVesting = _founderVesting;
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
        uint256 amountOut = OracleLibrary.getQuoteAtTick(tick, amount_, tokenIn, tokenOut);

        if(msg.sender == founderVesting){
            uint8 performanceTokenDecimals = IERC20Metadata(performanceToken).decimals();
            return scaleAmountOut(amountOut, performanceTokenDecimals);
        }
        return amountOut;
    }

    /**
     * @notice For calls to `valuation` from the Founder Vesting contract, scale the amountOut (performanceToken per THEO) to be in THEO decimals (9)
     * @param _amountOut        performanceToken amount (per THEO) from Uniswap TWAP, with performanceToken decimals
     * @param _performanceTokenDecimals    decimals used for the performance token
     */
    function scaleAmountOut(
        uint256 _amountOut,
        uint8 _performanceTokenDecimals
    ) internal pure returns (uint256) {
        if (_performanceTokenDecimals < DECIMALS) {
            return _amountOut * 10**uint256(DECIMALS - _performanceTokenDecimals);
        } else if (_performanceTokenDecimals > DECIMALS) {
            return _amountOut / 10**uint256(_performanceTokenDecimals - DECIMALS);
        }
        return _amountOut;
    }
}
