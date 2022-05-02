pragma solidity ^0.7.5;

// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
// import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
// import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
// import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "../Interfaces/ITHEO.sol";

contract BondingCalculatorMock {
    // 0x1F98431c8aD98523631AE4a59f267346ea31F984 // Uniswapv3 factory
    // 0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8 // Example-only Uniswap V3 pool address for USDC/ETH

    address public immutable theo;
    address public immutable quoteToken;
    uint160 public mockPrice = 4120754590000; // 9 decimals

    constructor(address _theo, address _quoteToken) {
        theo = _theo;
        quoteToken = _quoteToken;
    }

    function valuation(address tokenIn, uint256 _amount) public view returns (uint256 amountOut) {
        return mockPrice;
    }
}
