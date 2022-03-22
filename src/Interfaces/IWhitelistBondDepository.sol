// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.7.5;

import "./IERC20.sol";

interface IWhitelistBondDepository {
    // Info about each type of market
    struct Market {
        uint256 capacity; // capacity remaining
        IERC20 quoteToken; // token to accept as payment
        address priceFeed; // address of the price consumer, to return the USD value for the quote token when deposits are made
        bool capacityInQuote; // capacity limit is in payment token (true) or in THEO (false, default)
        uint64 sold; // base tokens out
        uint256 purchased; // quote tokens in
        uint256 usdPricePerTHEO; // 0 decimal USD value for each THEO bond
    }

    // Info for creating new markets
    struct Terms {
        bool fixedTerm; // fixed term or fixed expiration
        uint48 vesting; // length of time from deposit to maturity if fixed-term
        uint48 conclusion; // timestamp when market no longer offered (doubles as time when market matures if fixed-expiry)
    }

    // Additional info about market.
    struct Metadata {
        uint8 quoteDecimals; // decimals of quote token
    }

    struct DepositInfo {
        uint256 payout_;
        uint256 expiry_;
        uint256 index_;
    }

    /**
     * @notice deposit market
     * @param _bid uint256
     * @param _amount uint256
     * @param _maxPrice uint256
     * @param _user address
     * @param _referral address
     * @param signature bytes
     * @return depositInfo DepositInfo
     */
    function deposit(
        uint256 _bid,
        uint256 _amount,
        uint256 _maxPrice,
        address _user,
        address _referral,
        bytes calldata signature
    ) external returns (DepositInfo memory depositInfo);

    function create(
        IERC20 _quoteToken, // token used to deposit
        address _priceFeed, // address of the price consumer, to return the USD value for the quote token when deposits are made
        uint256[2] memory _market, // [capacity, fixed bond price (9 decimals) USD per THEO]
        bool[2] memory _booleans, // [capacity in quote, fixed term]
        uint256[2] memory _terms // [vesting, conclusion]
    ) external returns (uint256 id_);

    function close(uint256 _id) external;

    function isLive(uint256 _bid) external view returns (bool);

    function liveMarkets() external view returns (uint256[] memory);

    function liveMarketsFor(address _quoteToken) external view returns (uint256[] memory);

    function calculatePrice(uint256 _bid) external view returns (uint256);

    function payoutFor(uint256 _amount, uint256 _bid) external view returns (uint256);
}
