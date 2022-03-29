// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.7.5;

import "./IERC20.sol";

interface IBondDepository {
    // Info about each type of market
    struct Market {
        uint256 capacity; // capacity remaining
        IERC20 quoteToken; // token to accept as payment
        bool capacityInQuote; // capacity limit is in payment token (true) or in THEO (false, default)
        uint64 sold; // base tokens out
        uint256 purchased; // quote tokens in
        uint256 totalDebt; // total debt from market
        uint256 maxPayout; // max tokens in/out (determined by capacityInQuote false/true, respectively)
    }

    // Info for creating new markets
    struct Terms {
        bool fixedTerm; // fixed term or fixed expiration
        uint64 controlVariable; // scaling variable for price
        uint48 vesting; // length of time from deposit to maturity if fixed-term
        uint48 conclusion; // timestamp when market no longer offered (doubles as time when market matures if fixed-expiry)
        uint64 maxDebt; // 9 decimal debt maximum in THEO
        int64 bondRateFixed; // 9 decimal fixed discount expressed as a proportion (that is, a percentage in its decimal form)
        int64 maxBondRateVariable; // 9 decimal maximum proportion (that is, a percentage in its decimal form) discount on current market price
        int64 discountRateBond; // 9 decimal
        int64 discountRateYield; // 9 decimal
    }

    // Additional info about market.
    struct Metadata {
        uint48 lastTune; // last timestamp when control variable was tuned
        uint48 lastDecay; // last timestamp when market was created and debt was decayed
        uint48 length; // time from creation to conclusion. used as speed to decay debt.
        uint64 depositInterval; // target frequency of deposits
        uint64 tuneInterval; // frequency of tuning
        uint8 quoteDecimals; // decimals of quote token
    }

    // Control variable adjustment data
    struct Adjustment {
        uint64 change;
        uint48 lastAdjustment;
        uint64 timeToAdjusted;
        bool active;
    }

    /**
     * @notice deposit market
     * @param _bid uint256
     * @param _amount uint256
     * @param _maxPrice uint256
     * @param _user address
     * @param _referral address
     * @return payout_ uint256
     * @return expiry_ uint256
     * @return index_ uint256
     */
    function deposit(
        uint256 _bid,
        uint256 _amount,
        uint256 _maxPrice,
        address _user,
        address _referral
    )
        external
        returns (
            uint256 payout_,
            uint256 expiry_,
            uint256 index_
        );

    function create(
        IERC20 _quoteToken, // token used to deposit
        uint256[3] memory _market, // [capacity, initial price]
        bool[2] memory _booleans, // [capacity in quote, fixed term]
        uint256[2] memory _terms, // [vesting, conclusion, bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield]
        int64[4] memory _rates, // [bondRateFixed, maxBondRateVariable, initial discountRateBond (Drb), initial discountRateYield (Dyb)]
        uint64[2] memory _intervals // [deposit interval, tune interval]
    ) external returns (uint256 id_);

    function close(uint256 _id) external;

    function isLive(uint256 _bid) external view returns (bool);

    function liveMarkets() external view returns (uint256[] memory);

    function liveMarketsFor(address _quoteToken) external view returns (uint256[] memory);

    function payoutFor(uint256 _amount, uint256 _bid) external view returns (uint256);

    function marketPrice(uint256 _bid) external view returns (uint256);

    function currentDebt(uint256 _bid) external view returns (uint256);

    function debtRatio(uint256 _bid) external view returns (uint256);

    function debtDecay(uint256 _bid) external view returns (uint64);

    function getTheoBondingCalculator() external view returns (address);

    function setTheoBondingCalculator(address _theoBondingCalculator) external;
}
