// SPDX-License-Identifier: MIT

pragma solidity ^0.7.5;

import "../Types/TheopetraAccessControlled.sol";

import "../Libraries/SafeMath.sol";
import "../Libraries/SafeERC20.sol";
import "../Libraries/SignedSafeMath.sol";

import "../Interfaces/IFounderVesting.sol";
import "../Interfaces/ITHEO.sol";
import "../Interfaces/ITreasury.sol";

import "hardhat/console.sol";
/**
 * @title TheopetraFounderVesting
 * @dev This contract allows to split THEO payments among a group of accounts. The sender does not need to be aware
 * that the THEO will be split in this way, since it is handled transparently by the contract.
 *
 * The split can be in equal parts or in any other arbitrary proportion. The way this is specified is by assigning each
 * account to a number of shares. Of all the THEO that this contract receives, each account will then be able to claim
 * an amount proportional to the percentage of total shares they were assigned.
 *
 * `TheopetraFounderVesting` follows a _pull payment_ model. This means that payments are not automatically forwarded to the
 * accounts but kept in this contract, and the actual transfer is triggered as a separate step by calling the {release}
 * function.
 */
contract TheopetraFounderVesting is IFounderVesting, TheopetraAccessControlled {
    /* ========== DEPENDENCIES ========== */

    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */
    ITreasury private treasury;
    ITHEO private THEO;

    uint256 private fdvTarget;

    uint256 private totalShares;

    mapping(address => uint256) private shares;
    address[] private payees;

    mapping(IERC20 => uint256) private erc20TotalReleased;
    mapping(IERC20 => mapping(address => uint256)) private erc20Released;

    uint256 private deployTime = block.timestamp;
    uint256[] private unlockTimes;
    uint256[] private unlockAmounts;


    /**
     * @notice return the decimals in the percentage values and
     * thus the number of shares per percentage point (1% = 10_000_000 shares)
     */
    function decimals() public pure returns (uint8) {
        return 9;
    }

    /**
     * @dev Creates an instance of `TheopetraFounderVesting` where each account in `payees` is assigned the number of shares at
     * the matching position in the `shares` array.
     *
     * All addresses in `payees` must be non-zero. Both arrays must have the same non-zero length, and there must be no
     * duplicates in `payees`.
     */
    constructor(
        ITheopetraAuthority _authority,
        address _treasury,
        address _theo,
        uint256 _fdvTarget,
        address[] memory _payees,
        uint256[] memory _shares,
        uint256[] memory _unlockTimes,
        uint256[] memory _unlockAmounts
    ) TheopetraAccessControlled(_authority) {
        require(_payees.length == _shares.length, "TheopetraFounderVesting: payees and shares length mismatch");
        require(_payees.length > 0, "TheopetraFounderVesting: no payees");
        require(_unlockTimes.length == _unlockAmounts.length, "TheopetraFounderVesting: unlock times and amounts length mismatch");
        require(_unlockTimes.length > 0, "TheopetraFounderVesting: no unlock schedule");

        fdvTarget = _fdvTarget;
        THEO = ITHEO(_theo);
        treasury = ITreasury(_treasury);
        unlockTimes = _unlockTimes;
        unlockAmounts = _unlockAmounts;

        for (uint256 i = 0; i < _payees.length; i++) {
            _addPayee(_payees[i], _shares[i]);
        }

        // mint tokens for the initial shares
        uint256 tokensToMint = totalShares.mul(THEO.totalSupply())
            .div(10**decimals() - totalShares);
        treasury.mint(address(this), tokensToMint);
    }

    /**
     * @dev Getter for the total shares held by payees.
     */
    function getTotalShares() public view override returns (uint256) {
        return totalShares;
    }

    /**
     * @dev Getter for the total amount of `token` already released. `token` should be the address of an IERC20
     * contract.
     */
    function getTotalReleased(IERC20 token) public view override returns (uint256) {
        return erc20TotalReleased[token];
    }

    /**
     * @dev Getter for the amount of shares held by an account.
     */
    function getShares(address account) public view override returns (uint256) {
        return shares[account];
    }

    /**
     * @dev Getter for the amount of `token` tokens already released to a payee. `token` should be the address of an
     * IERC20 contract.
     */
    function getReleased(IERC20 token, address account) public view override returns (uint256) {
        return erc20Released[token][account];
    }

    /**
     * @dev Getter for unlocked multiplier for time-locked funds. This is the percent currently unlocked as a decimal ratio of 1.
     */
    function getUnlockedMultiplier() public view returns (uint256) {
        uint256 timeSinceDeploy = block.timestamp - deployTime;
        for(uint256 i = unlockTimes.length; i > 0; i--) {
            if(timeSinceDeploy >= unlockTimes[i-1]) {
                return unlockAmounts[i-1];
            }
        }
        return 0;
    }

    function rebalance() public {
        uint256 totalSupply = THEO.totalSupply();
        uint256 contractBalance = THEO.balanceOf(address(this));
        uint256 totalReleased = erc20TotalReleased[THEO];

        uint256 founderAmount = totalShares.mul(totalSupply - contractBalance)
            .div(10**decimals() - totalShares);

        if (founderAmount > (contractBalance + totalReleased)) {
            treasury.mint(address(this), founderAmount - (contractBalance + totalReleased));
        } else if (founderAmount < (contractBalance + totalReleased)) {
            THEO.burnFrom(address(this), contractBalance + totalReleased - founderAmount);
        }
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of `token` tokens they are owed, according to their
     * percentage of the total shares and their previous withdrawals. `token` must be the address of an IERC20
     * contract.
     */
    function release(IERC20 token, address account) public override {
        require(shares[account] > 0, "TheopetraFounderVesting: account has no shares");

        uint256 totalReceived = token.balanceOf(address(this)) + getTotalReleased(token);
        uint256 payment = _pendingPayment(account, totalReceived, getReleased(token, account));

        require(payment != 0, "TheopetraFounderVesting: account is not due payment");

        erc20Released[token][account] += payment;
        erc20TotalReleased[token] += payment;

        SafeERC20.safeTransfer(token, account, payment);
        emit ERC20PaymentReleased(token, account, payment);
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of `token` tokens specified, according to their
     * percentage of the total shares and their previous withdrawals. `token` must be the address of an IERC20
     * contract.
     */
    function releaseAmount(IERC20 token, address account, uint256 amount) public override {
        require(shares[account] > 0, "TheopetraFounderVesting: account has no shares");
        require(amount > 0, "TheopetraFounderVesting: amount cannot be 0");

        uint256 totalReceived = token.balanceOf(address(this)) + getTotalReleased(token);
        uint256 payment = _pendingPayment(account, totalReceived, getReleased(token, account));

        require(payment != 0, "TheopetraFounderVesting: account is not due payment");
        require(amount <= payment, "TheopetraFounderVesting: requested amount is more than due payment for account");

        erc20Released[token][account] += amount;
        erc20TotalReleased[token] += amount;

        SafeERC20.safeTransfer(token, account, amount);
        emit ERC20PaymentReleased(token, account, amount);
    }

    /**
     * @dev Returns the amount of tokens that could be paid to `account` at the current time.
     */
    function getReleasable(IERC20 token, address account) external override view returns (uint256) {
        require(shares[account] > 0, "TheopetraFounderVesting: account has no shares");

        uint256 totalReceived = token.balanceOf(address(this)) + getTotalReleased(token);
        uint256 payment = _pendingPayment(account, totalReceived, getReleased(token, account));

        return payment;
    }

    /**
     * @dev internal logic for computing the pending payment of an `account` given the token historical balances and
     * already released amounts.
     */
    function _pendingPayment(
        address account,
        uint256 totalReceived,
        uint256 alreadyReleased
    ) private view returns (uint256) {
        // console.log(totalReceived);
        // console.log(shares[account]);
        // console.log(getUnlockedMultiplier());
        // console.log(totalShares);
        // console.log(alreadyReleased);
        // console.log((totalReceived * shares[account] * getUnlockedMultiplier()) / (totalShares * 10**decimals()) - alreadyReleased);
        return (totalReceived * shares[account] * getUnlockedMultiplier()) / (totalShares * 10**decimals()) - alreadyReleased;
    }

    /**
     * @dev Add a new payee to the contract.
     * @param account The address of the payee to add.
     * @param shares_ The number of shares owned by the payee.
     */
    function _addPayee(address account, uint256 shares_) private {
        require(account != address(0), "TheopetraFounderVesting: account is the zero address");
        require(shares_ > 0, "TheopetraFounderVesting: shares are 0");
        require(shares[account] == 0, "TheopetraFounderVesting: account already has shares");

        payees.push(account);
        shares[account] = shares_;
        totalShares = totalShares + shares_;
        emit PayeeAdded(account, shares_);
    }

}
