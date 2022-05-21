// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import "../Interfaces/IERC20Metadata.sol";
import "../Interfaces/IBondCalculator.sol";
import "../Interfaces/IMockOracleLibrary.sol";

import "../Libraries/SafeMath.sol";
import "../Libraries/SafeCast.sol";

import "../Types/TheopetraAccessControlled.sol";

import "hardhat/console.sol";

contract NewBondingCalculatorMock is IBondCalculator, TheopetraAccessControlled {
    using SafeMath for int256;
    using SafeCast for *;

    address public immutable theo;
    uint256 public performanceTokenAmount;

    constructor(
        address _theo,
        address _authority
    ) TheopetraAccessControlled(ITheopetraAuthority(_authority)) {
        theo = _theo;
    }

    function valuation(address tokenIn, uint256 _amount) external view override returns (uint256) {
        if (tokenIn == theo) {
            return performanceTokenAmount;
        }
    }

    function setPerformanceTokenAmount(uint256 _amount) public onlyGovernor {
        performanceTokenAmount = _amount;
    }

    /**
     * @param _percentageChange   the percentage by which the performance token should be updated
     * @dev                 use to update the Token ROI (deltaTokenPrice) by the specified percentage
     */
    function updatePerformanceTokenAmount(int256 _percentageChange) public onlyGovernor {
        performanceTokenAmount = ((performanceTokenAmount).toInt256() + ((performanceTokenAmount).toInt256() * _percentageChange / 100)).toUint256();
    }
}
