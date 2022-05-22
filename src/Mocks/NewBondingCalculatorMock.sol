// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import "../Interfaces/IERC20Metadata.sol";
import "../Interfaces/IBondCalculator.sol";

import "../Libraries/SafeMath.sol";
import "../Libraries/SafeCast.sol";

import "../Types/TheopetraAccessControlled.sol";

import "hardhat/console.sol";

contract NewBondingCalculatorMock is IBondCalculator, TheopetraAccessControlled {
    using SafeMath for int256;
    using SafeCast for *;

    address public immutable theo;
    uint256 public performanceTokenAmount;
    address public weth;
    address public usdc;

    constructor(
        address _theo,
        address _authority
    ) TheopetraAccessControlled(ITheopetraAuthority(_authority)) {
        theo = _theo;
    }

    /**
     * @dev when tokenIn is theo, valuation is being used for the Treasury (`tokenPerformanceUpdate`)
     *      when tokenIn is WETH or USDC (aka, a 'quote token'), valuation is being used for the Bond Depository (`marketPrice`)
     *      If tokenIn is WETH, the method returns the number of THEO expected per `_amount` of WETH
     *      where the number of THEO per quote token is calculated based on the following mock dollar prices:
     *      2000 dollars per Weth
     *      1 dollar per USDC
     *      0.01 dollars per THEO
     *      THEO per WETH is 2000 / 0.01 (i.e., 200000)
     *      THEO per USDC is 1 / 0.01 (i.e. 100)
     *      THEO is 9 decimals, WETH is 18 decimals, USDC is 6 decimals
     */
    function valuation(address tokenIn, uint256 _amount) external view override returns (uint256) {
        if (tokenIn == theo) {

            return performanceTokenAmount;
        } else if (tokenIn == weth) {
            return (_amount * (200000 * 10**9)) / 10**18;
        } else if (tokenIn == usdc) {
            return (_amount * (100 * 10**9)) / 10**6;
        }
    }

    function setPerformanceTokenAmount(uint256 _amount) public onlyGovernor {
        performanceTokenAmount = _amount;
    }

    function setWethAddress(address _weth) public onlyGovernor {
        weth = _weth;
    }

    function setUsdcAddress(address _usdc) public onlyGovernor {
        usdc = _usdc;
    }

    /**
     * @param _percentageChange   the percentage by which the performance token should be updated
     * @dev                 use to update the Token ROI (deltaTokenPrice) by the specified percentage
     */
    function updatePerformanceTokenAmount(int256 _percentageChange) public onlyGovernor {
        performanceTokenAmount = ((performanceTokenAmount).toInt256() + ((performanceTokenAmount).toInt256() * _percentageChange / 100)).toUint256();
    }
}
