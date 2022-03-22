// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

import "../Types/NoteKeeper.sol";
import "../Types/Signed.sol";
import "../Types/PriceConsumerV3.sol";

import "../Libraries/SafeERC20.sol";

import "../Interfaces/IERC20Metadata.sol";
import "../Interfaces/IWhitelistBondDepository.sol";

/**
 * @title Theopetra Bond Depository
 * @notice Originally based off of Olympus Bond Depository V2
 */

contract WhitelistTheopetraBondDepository is IWhitelistBondDepository, NoteKeeper, Signed, PriceConsumerV3 {
    /* ======== DEPENDENCIES ======== */

    using SafeERC20 for IERC20;

    /* ======== EVENTS ======== */

    event CreateMarket(
        uint256 indexed id,
        address indexed baseToken,
        address indexed quoteToken,
        uint256 fixedBondPrice
    );
    event CloseMarket(uint256 indexed id);
    event Bond(uint256 indexed id, uint256 amount, uint256 price);
    event Tuned(uint256 indexed id, uint64 oldControlVariable, uint64 newControlVariable);

    /* ======== STATE VARIABLES ======== */

    // Storage
    Market[] public markets; // persistent market data
    Terms[] public terms; // deposit construction data
    Metadata[] public metadata; // extraneous market data
    mapping(uint256 => Adjustment) public adjustments; // control variable changes

    // Queries
    mapping(address => uint256[]) public marketsForQuote; // market IDs for quote token

    /* ======== CONSTRUCTOR ======== */

    constructor(
        ITheopetraAuthority _authority,
        IERC20 _theo,
        IsTHEO _stheo,
        IStaking _staking,
        ITreasury _treasury
    ) NoteKeeper(_authority, _theo, _stheo, _staking, _treasury) {
        // save gas for users by bulk approving stake() transactions
        _theo.approve(address(_staking), 1e45);
    }

    /* ======== DEPOSIT ======== */

    /**
     * @notice             deposit quote tokens in exchange for a bond from a specified market
     * @param _id          the ID of the market
     * @param _amount      the amount of quote token to spend
     * @param _maxPrice    the maximum price at which to buy
     * @param _user        the recipient of the payout
     * @param _referral    the front end operator address
     * @return depositInfo DepositInfo
     */
    function deposit(
        uint256 _id,
        uint256 _amount,
        uint256 _maxPrice,
        address _user,
        address _referral,
        bytes calldata signature
    ) external override returns (DepositInfo memory depositInfo) {
        verifySignature("somedata", signature);
        Market storage market = markets[_id];
        Terms memory term = terms[_id];
        uint48 currentTime = uint48(block.timestamp);

        // Markets end at a defined timestamp
        // |-------------------------------------| t
        require(currentTime < term.conclusion, "Depository: market concluded");

        // Debt and the control variable decay over time
        _decay(_id, currentTime);

        // Get the amount of THEO per quote token
        // With 9 decimal places
        uint256 price = calculatePrice(_id);

        // Users input a maximum price, which protects them from price changes after
        // entering the mempool. max price is a slippage mitigation measure
        require(price <= _maxPrice, "Depository: more than max price");

        /**
         * payout for the deposit = amount / price
         *
         * where
         * payout = THEO out, in THEO decimals (9)
         * amount = quote tokens in
         * price = THEO per quote token, in THEO decimals (9) (e.g. 3473326 THEO (9 decimals) / ETH; equivalent to 0.003473326 THEO/ETH)
         *
         * 1e18 = THEO decimals (9) + price decimals (9)
         */
        depositInfo.payout_ = ((_amount * 1e18) / price) / (10**metadata[_id].quoteDecimals);

        // markets have a max payout amount, capping size because deposits
        // do not experience slippage. max payout is recalculated upon tuning
        require(depositInfo.payout_ <= market.maxPayout, "Depository: max size exceeded");

        /*
         * each market is initialized with a capacity
         *
         * this is either the number of THEO that the market can sell
         * (if capacity in quote is false),
         *
         * or the number of quote tokens that the market can buy
         * (if capacity in quote is true)
         */
        market.capacity -= market.capacityInQuote ? _amount : depositInfo.payout_;

        /**
         * bonds mature with a cliff at a set timestamp
         * prior to the expiry timestamp, no payout tokens are accessible to the user
         * after the expiry timestamp, the entire payout can be redeemed
         *
         * there are two types of bonds: fixed-term and fixed-expiration
         *
         * fixed-term bonds mature in a set amount of time from deposit
         * i.e. term = 1 week. when alice deposits on day 1, her bond
         * expires on day 8. when bob deposits on day 2, his bond expires day 9.
         *
         * fixed-expiration bonds mature at a set timestamp
         * i.e. expiration = day 10. when alice deposits on day 1, her term
         * is 9 days. when bob deposits on day 2, his term is 8 days.
         */
        depositInfo.expiry_ = term.fixedTerm ? term.vesting + currentTime : term.vesting;

        // markets keep track of how many quote tokens have been
        // purchased, and how much THEO has been sold
        market.purchased += _amount;
        market.sold += uint64(depositInfo.payout_);

        // incrementing total debt raises the price of the next bond
        market.totalDebt += uint64(depositInfo.payout_);

        emit Bond(_id, _amount, price);

        /**
         * user data is stored as Notes. these are isolated array entries
         * storing the amount due, the time created, the time when payout
         * is redeemable, the time when payout was redeemed, and the ID
         * of the market deposited into
         */
        depositInfo.index_ = addNote(_user, depositInfo.payout_, uint48(depositInfo.expiry_), uint48(_id), _referral);

        // transfer payment to treasury
        market.quoteToken.safeTransferFrom(msg.sender, address(treasury), _amount);

        // if max debt is breached, the market is closed
        // this a circuit breaker
        if (term.maxDebt < market.totalDebt) {
            market.capacity = 0;
            emit CloseMarket(_id);
        } else {
            // if market will continue, the control variable is tuned to hit targets on time
            _tune(_id, currentTime);
        }
    }

    /**
     * @notice             decay debt, and adjust control variable if there is an active change
     * @param _id          ID of market
     * @param _time        uint48 timestamp (saves gas when passed in)
     */
    function _decay(uint256 _id, uint48 _time) internal {
        // Debt decay

        /*
         * Debt is a time-decayed sum of tokens spent in a market
         * Debt is added when deposits occur and removed over time
         * |
         * |    debt falls with
         * |   / \  inactivity       / \
         * | /     \              /\/    \
         * |         \           /         \
         * |           \      /\/            \
         * |             \  /  and rises       \
         * |                with deposits
         * |
         * |------------------------------------| t
         */
        markets[_id].totalDebt -= debtDecay(_id);
        metadata[_id].lastDecay = _time;

        // Control variable decay

        // The bond control variable is continually tuned. When it is lowered (which
        // lowers the market price), the change is carried out smoothly over time.
        if (adjustments[_id].active) {
            Adjustment storage adjustment = adjustments[_id];

            (uint64 adjustBy, uint48 secondsSince, bool stillActive) = _controlDecay(_id);
            terms[_id].controlVariable -= adjustBy;

            if (stillActive) {
                adjustment.change -= adjustBy;
                adjustment.timeToAdjusted -= secondsSince;
                adjustment.lastAdjustment = _time;
            } else {
                adjustment.active = false;
            }
        }
    }

    /**
     * @notice             auto-adjust control variable to hit capacity/spend target
     * @param _id          ID of market
     * @param _time        uint48 timestamp (saves gas when passed in)
     */
    function _tune(uint256 _id, uint48 _time) internal {
        Metadata memory meta = metadata[_id];

        if (_time >= meta.lastTune + meta.tuneInterval) {
            Market memory market = markets[_id];

            // compute seconds remaining until market will conclude
            uint256 timeRemaining = terms[_id].conclusion - _time;
            uint256 price = calculatePrice(_id);

            // standardize capacity into an base token amount
            // theo decimals (9) + price decimals (9)
            uint256 capacity = market.capacityInQuote
                ? ((market.capacity * 1e18) / price) / (10**meta.quoteDecimals)
                : market.capacity;

            /**
             * calculate the correct payout to complete on time assuming each bond
             * will be max size in the desired deposit interval for the remaining time
             *
             * i.e. market has 10 days remaining. deposit interval is 1 day. capacity
             * is 10,000 THEO. max payout would be 1,000 THEO (10,000 * 1 / 10).
             */
            markets[_id].maxPayout = uint64((capacity * meta.depositInterval) / timeRemaining);

            // calculate the ideal total debt to satisfy capacity in the remaining time
            uint256 targetDebt = (capacity * meta.length) / timeRemaining;

            // derive a new control variable from the target debt and current supply
            uint64 newControlVariable = uint64((price * treasury.baseSupply()) / targetDebt);

            emit Tuned(_id, terms[_id].controlVariable, newControlVariable);

            if (newControlVariable >= terms[_id].controlVariable) {
                terms[_id].controlVariable = newControlVariable;
            } else {
                // if decrease, control variable change will be carried out over the tune interval
                // this is because price will be lowered
                uint64 change = terms[_id].controlVariable - newControlVariable;
                adjustments[_id] = Adjustment(change, _time, meta.tuneInterval, true);
            }
            metadata[_id].lastTune = _time;
        }
    }

    /* ======== CREATE ======== */

    /**
     * @notice             creates a new market type
     * @dev                current price should be in 9 decimals.
     * @param _quoteToken  token used to deposit
     * @param _market      [capacity (in THEO or quote), fixed bond price (9 decimals) USD per THEO, debt buffer (3 decimals)]
     * @param _booleans    [capacity in quote, fixed term]
     * @param _terms       [vesting length (if fixed term) or vested timestamp, conclusion timestamp]
     * @param _intervals   [deposit interval (seconds), tune interval (seconds)]
     * @param _priceFeed   address of the price consumer, to return the USD value for the quote token when deposits are made
     * @return id_         ID of new bond market
     */
    function create(
        IERC20 _quoteToken,
        address _priceFeed,
        uint256[3] memory _market,
        bool[2] memory _booleans,
        uint256[2] memory _terms,
        uint32[2] memory _intervals
    ) external override onlyPolicy returns (uint256 id_) {
        // the length of the program, in seconds
        uint256 secondsToConclusion = _terms[1] - block.timestamp;

        // the decimal count of the quote token
        uint256 decimals = IERC20Metadata(address(_quoteToken)).decimals();

        /*
         * initial target debt is equal to capacity (this is the amount of debt
         * that will decay over in the length of the program if price remains the same).
         * it is converted into base token terms if passed in in quote token terms.
         *
         * 1e18 = theo decimals (9) + fixed bond price decimals (9)
         */
        uint64 targetDebt = uint64(_booleans[0] ? ((_market[0] * 1e18) / _market[1]) / 10**decimals : _market[0]);

        /*
         * max payout is the amount of capacity that should be utilized in a deposit
         * interval. for example, if capacity is 1,000 THEO, there are 10 days to conclusion,
         * and the preferred deposit interval is 1 day, max payout would be 100 THEO.
         */
        uint64 maxPayout = uint64((targetDebt * _intervals[0]) / secondsToConclusion);

        /*
         * max debt serves as a circuit breaker for the market. let's say the quote
         * token is a stablecoin, and that stablecoin depegs. without max debt, the
         * market would continue to buy until it runs out of capacity. this is
         * configurable with a 3 decimal buffer (1000 = 1% above initial price).
         * note that its likely advisable to keep this buffer wide.
         * note that the buffer is above 100%. i.e. 10% buffer = initial debt * 1.1
         */
        uint256 maxDebt = targetDebt + ((targetDebt * _market[2]) / 1e5); // 1e5 = 100,000. 10,000 / 100,000 = 10%.

        /*
         * the control variable is set so that initial price equals the desired
         * initial price. the control variable is the ultimate determinant of price,
         * so we compute this last.
         *
         * price = control variable * debt ratio
         * debt ratio = total debt / supply
         * therefore, control variable = price / debt ratio
         */
        uint256 controlVariable = (_market[1] * treasury.baseSupply()) / targetDebt;

        // depositing into, or getting info for, the created market uses this ID
        id_ = markets.length;

        markets.push(
            Market({
                quoteToken: _quoteToken,
                priceFeed: _priceFeed,
                capacityInQuote: _booleans[0],
                capacity: _market[0],
                totalDebt: targetDebt,
                maxPayout: maxPayout,
                purchased: 0,
                sold: 0,
                usdPricePerTHEO: _market[1]
            })
        );

        terms.push(
            Terms({
                fixedTerm: _booleans[1],
                controlVariable: uint64(controlVariable),
                vesting: uint48(_terms[0]),
                conclusion: uint48(_terms[1]),
                maxDebt: uint64(maxDebt)
            })
        );

        metadata.push(
            Metadata({
                lastTune: uint48(block.timestamp),
                lastDecay: uint48(block.timestamp),
                length: uint48(secondsToConclusion),
                depositInterval: _intervals[0],
                tuneInterval: _intervals[1],
                quoteDecimals: uint8(decimals)
            })
        );

        marketsForQuote[address(_quoteToken)].push(id_);

        emit CreateMarket(id_, address(theo), address(_quoteToken), _market[1]);
    }

    /**
     * @notice             disable existing market
     * @param _id          ID of market to close
     */
    function close(uint256 _id) external override onlyPolicy {
        terms[_id].conclusion = uint48(block.timestamp);
        markets[_id].capacity = 0;
        emit CloseMarket(_id);
    }

    /* ======== EXTERNAL VIEW ======== */

    /**
     * @notice             payout due for amount of quote tokens
     * @dev                accounts for debt and control variable decay so it is up to date
     * @param _amount      amount of quote tokens to spend
     * @param _id          ID of market
     * @return             amount of THEO to be paid in THEO decimals
     *
     * @dev 1e18 = theo decimals (9) + fixed bond price decimals (9)
     */
    function payoutFor(uint256 _amount, uint256 _id) external view override returns (uint256) {
        Metadata memory meta = metadata[_id];
        return (_amount * 1e18) / calculatePrice(_id) / 10**meta.quoteDecimals;
    }

    /**
     * @notice             calculate current ratio of debt to supply
     * @dev                uses current debt, which accounts for debt decay since last deposit (vs _debtRatio())
     * @param _id          ID of market
     * @return             debt ratio for market in quote decimals
     */
    function debtRatio(uint256 _id) public view override returns (uint256) {
        return (currentDebt(_id) * (10**metadata[_id].quoteDecimals)) / treasury.baseSupply();
    }

    /**
     * @notice             calculate debt factoring in decay
     * @dev                accounts for debt decay since last deposit
     * @param _id          ID of market
     * @return             current debt for market in THEO decimals
     */
    function currentDebt(uint256 _id) public view override returns (uint256) {
        return markets[_id].totalDebt - debtDecay(_id);
    }

    /**
     * @notice             amount of debt to decay from total debt for market ID
     * @param _id          ID of market
     * @return             amount of debt to decay
     */
    function debtDecay(uint256 _id) public view override returns (uint64) {
        Metadata memory meta = metadata[_id];

        uint256 secondsSince = block.timestamp - meta.lastDecay;

        return uint64((markets[_id].totalDebt * secondsSince) / meta.length);
    }

    /**
     * @notice             up to date control variable
     * @dev                accounts for control variable adjustment
     * @param _id          ID of market
     * @return             control variable for market in THEO decimals
     */
    function currentControlVariable(uint256 _id) public view returns (uint256) {
        (uint64 decay, , ) = _controlDecay(_id);
        return terms[_id].controlVariable - decay;
    }

    /**
     * @notice             is a given market accepting deposits
     * @param _id          ID of market
     */
    function isLive(uint256 _id) public view override returns (bool) {
        return (markets[_id].capacity != 0 && terms[_id].conclusion > block.timestamp);
    }

    /**
     * @notice returns an array of all active market IDs
     */
    function liveMarkets() external view override returns (uint256[] memory) {
        uint256 num;
        for (uint256 i = 0; i < markets.length; i++) {
            if (isLive(i)) num++;
        }

        uint256[] memory ids = new uint256[](num);
        uint256 nonce;
        for (uint256 i = 0; i < markets.length; i++) {
            if (isLive(i)) {
                ids[nonce] = i;
                nonce++;
            }
        }
        return ids;
    }

    /**
     * @notice             returns an array of all active market IDs for a given quote token
     * @param _token       quote token to check for
     */
    function liveMarketsFor(address _token) external view override returns (uint256[] memory) {
        uint256[] memory mkts = marketsForQuote[_token];
        uint256 num;

        for (uint256 i = 0; i < mkts.length; i++) {
            if (isLive(mkts[i])) num++;
        }

        uint256[] memory ids = new uint256[](num);
        uint256 nonce;

        for (uint256 i = 0; i < mkts.length; i++) {
            if (isLive(mkts[i])) {
                ids[nonce] = mkts[i];
                nonce++;
            }
        }
        return ids;
    }

    /**
     * @notice                  calculate the price of THEO per quote token
     * @dev                     get the latest price for the market's quote token in USD
     *                          (`priceConsumerPrice`, with decimals `priceConsumerDecimals`)
     *                          then `scalePrice` to scale the fixed bond price to THEO decimals when calculating `price`.
     *                          finally, calculate `price` as THEO per quote token, in THEO decimals (9)
     * @param _id               market ID
     * @return                  uint256 price of THEO per quote token, in THEO decimals (9)
     */
    function calculatePrice(uint256 _id) public view override returns (uint256) {
        (int256 priceConsumerPrice, uint8 priceConsumerDecimals) = getLatestPrice(
            markets[_id].priceFeed
        );

        int256 scaledPrice = scalePrice(int256(markets[_id].usdPricePerTHEO), 9, 9 + priceConsumerDecimals);

        uint256 price = uint256(scaledPrice / priceConsumerPrice);
        return price;
    }

    /* ======== INTERNAL VIEW ======== */

    /**
     * @notice                  calculate debt factoring in decay
     * @dev                     uses info from storage because data has been updated before call (vs debtRatio())
     * @param _id               market ID
     * @return                  current debt for market in quote decimals
     */
    function _debtRatio(uint256 _id) internal view returns (uint256) {
        return (markets[_id].totalDebt * (10**metadata[_id].quoteDecimals)) / treasury.baseSupply();
    }

    /**
     * @notice                  amount to decay control variable by
     * @param _id               ID of market
     * @return decay_           change in control variable
     * @return secondsSince_    seconds since last change in control variable
     * @return active_          whether or not change remains active
     */
    function _controlDecay(uint256 _id)
        internal
        view
        returns (
            uint64 decay_,
            uint48 secondsSince_,
            bool active_
        )
    {
        Adjustment memory info = adjustments[_id];
        if (!info.active) return (0, 0, false);

        secondsSince_ = uint48(block.timestamp) - info.lastAdjustment;

        active_ = secondsSince_ < info.timeToAdjusted;
        decay_ = active_ ? (info.change * secondsSince_) / info.timeToAdjusted : info.change;
    }

    /* ======== INTERNAL PURE ======== */

    /**
     * @param _price            fixed bond price (USD per THEO), 9 decimals
     * @param _priceDecimals    decimals (9) used for the fixed bond price
     * @param _decimals         sum of decimals for THEO token (9) + decimals for the price feed
     */
    function scalePrice(
        int256 _price,
        uint8 _priceDecimals,
        uint8 _decimals
    ) internal pure returns (int256) {
        if (_priceDecimals < _decimals) {
            return _price * int256(10**uint256(_decimals - _priceDecimals));
        } else if (_priceDecimals > _decimals) {
            return _price / int256(10**uint256(_priceDecimals - _decimals));
        }
        return _price;
    }
}
