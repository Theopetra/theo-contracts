// SPDX-License-Identifier: MIT

pragma solidity ^0.7.5;

import "../Types/TheopetraAccessControlled.sol";

import "../Libraries/SafeMath.sol";
import "../Libraries/SafeERC20.sol";

import "../Interfaces/IFounderVesting.sol";
import "../Interfaces/ITHEO.sol";
import "../Interfaces/ITreasury.sol";

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
 *
 * NOTE: This contract assumes that ERC20 tokens will behave similarly to native tokens (THEO). Rebasing tokens, and
 * tokens that apply fees during transfers, are likely to not be supported as expected. If in doubt, we encourage you
 * to run tests before sending real value to this contract.
 */
contract TheopetraFounderVesting is IFounderVesting, TheopetraAccessControlled {
    /* ========== DEPENDENCIES ========== */

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */
    ITreasury private treasury;
    ITHEO private THEO;

    uint256 private fdvTarget;

    uint256 private totalShares;
    uint256 private totalReleased;

    mapping(address => uint256) private shares;
    mapping(address => uint256) private released;
    address[] private payees;

    mapping(IERC20 => uint256) private erc20TotalReleased;
    mapping(IERC20 => mapping(address => uint256)) private erc20Released;

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
        uint256[] memory _shares
    ) TheopetraAccessControlled(_authority) {
        require(_payees.length == _shares.length, "TheopetraFounderVesting: payees and shares length mismatch");
        require(_payees.length > 0, "TheopetraFounderVesting: no payees");

        fdvTarget = _fdvTarget;
        THEO = ITHEO(_theo);
        treasury = ITreasury(_treasury);

        for (uint256 i = 0; i < _payees.length; i++) {
            _addPayee(_payees[i], _shares[i]);
        }

        // mint tokens for the initial shares
        uint256 tokensToMint = THEO.totalSupply().mul(totalShares).div(10**decimals());
        treasury.mint(address(this), tokensToMint);
    }

    /**
     * @dev Getter for the total shares held by payees.
     */
    function getTotalShares() public view override returns (uint256) {
        return totalShares;
    }

    /**
     * @dev Getter for the total amount of THEO already released.
     */
    function getTotalReleased() public view override returns (uint256) {
        return totalReleased;
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
     * @dev Getter for the amount of THEO already released to a payee.
     */
    function getReleased(address account) public view override returns (uint256) {
        return released[account];
    }

    /**
     * @dev Getter for the amount of `token` tokens already released to a payee. `token` should be the address of an
     * IERC20 contract.
     */
    function getReleased(IERC20 token, address account) public view override returns (uint256) {
        return erc20Released[token][account];
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of THEO they are owed, according to their percentage of the
     * total shares and their previous withdrawals.
     */
    function release(address payable account) public virtual override {
        require(shares[account] > 0, "TheopetraFounderVesting: account has no shares");

        uint256 totalReceived = address(this).balance + getTotalReleased();
        uint256 payment = _pendingPayment(account, totalReceived, getReleased(account));

        require(payment != 0, "TheopetraFounderVesting: account is not due payment");

        released[account] += payment;
        totalReleased += payment;

        _sendValue(account, payment);
        emit PaymentReleased(account, payment);
    }

    /**
     * @dev Triggers a transfer to `account` of the amount of `token` tokens they are owed, according to their
     * percentage of the total shares and their previous withdrawals. `token` must be the address of an IERC20
     * contract.
     */
    function release(IERC20 token, address account) public virtual override {
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
     * @dev internal logic for computing the pending payment of an `account` given the token historical balances and
     * already released amounts.
     */
    function _pendingPayment(
        address account,
        uint256 totalReceived,
        uint256 alreadyReleased
    ) private view returns (uint256) {
        return (totalReceived * shares[account]) / totalShares - alreadyReleased;
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

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.5.11/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function _sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "FounderVesting: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "FounderVesting: unable to send, recipient may have reverted");
    }

}
