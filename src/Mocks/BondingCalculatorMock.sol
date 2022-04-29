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
    bool public immutable isUsdc;

    constructor(
        address _theo,
        address _quoteToken,
        bool _isUsdc
    ) {
        theo = _theo;
        quoteToken = _quoteToken;
        isUsdc = _isUsdc;
    }

    function getPoolFromFactory(
        address factoryAddress,
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal view returns (address pool) {
        return 0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8; // Just using an example address for this mock
    }

    function valuation(address _theo, uint256 _amount) public view returns (uint256 sqrtPriceX96) {
        require(_theo == theo, "Incorrect address for THEO");
        // Get address of the Uniswap pool for the token pair (i.e the Quote-Token/THEO pair)
        getPoolFromFactory(0x1F98431c8aD98523631AE4a59f267346ea31F984, quoteToken, address(_theo), 3000);

        // Uniswap pool address would be used to get a TWAP, or potentially just a spot price as a Uniswap sqrtPriceX96

        // Return price (converted from sqrtPriceX96)
        return _amount * getPriceX96FromSqrtPriceX96(1234217676608908277512433764);
    }

    /**
     * @notice             Return Quote-Token per THEO value
     * @dev                for example: 242674 (9 decimals): 0.000242674 ETH per THEO (ca. 4120 THEO per ETH)
     */
    function getPriceX96FromSqrtPriceX96(uint160 sqrtPriceX96) public view returns (uint256 priceX96) {
        // 9 decimals
        return isUsdc ? 1000242674 : 242674;
    }
}
