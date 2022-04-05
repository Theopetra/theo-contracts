// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity >=0.7.0 <=0.8.0;

import "../Types/TheopetraAccessControlled.sol";

import "../Libraries/SafeERC20.sol";
import "../Libraries/SafeMath.sol";
import "../Libraries/SignedSafeMath.sol";
import "../Libraries/SafeCast.sol";

import "../Interfaces/ITreasury.sol";
import "../Interfaces/IERC20.sol";
import "../Interfaces/IDistributor.sol";

contract StakingDistributor is IDistributor, TheopetraAccessControlled {
    /* ========== DEPENDENCIES ========== */

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeCast for uint256;

    /* ====== VARIABLES ====== */

    IERC20 private immutable THEO;
    ITreasury private immutable treasury;
    address private immutable staking;

    uint48 public immutable epochLength;

    mapping(uint256 => Adjust) public adjustments;
    uint256 public override bounty;

    uint256 private immutable rateDenominator = 1_000_000;

    // bytes16 private immutable n = ABDKMathQuad.fromUInt(1095);
    // bytes16 private one = ABDKMathQuad.fromUInt(1);

    /* ====== STRUCTS ====== */

    /**
        @notice starting rate and recipient for rewards
        @dev    Info::start is the starting rate for rewards in ten-thousandsths (2000 = 0.2%);
                Info::recipient is the recipient staking contract for rewards
                Info::drs is the Discount Rate Return Staking. The discount rate applied to the fluctuation of the token price, as a proportion (that is, a percentage in its decimal form), with 9 decimals
                Info::dys is the discount rate applied to the fluctuation of the treasury yield, as a proportion (that is, a percentage in its decimal form), with 9 decimals
                Info::locked is whether the staking tranche is locked (true) or unlocked (false)
                Info::nextEpochTime is the timestamp for the next epoch, when wind-down will be applied to the starting reward rate and the maximum reward rate
     */
    struct Info {
        uint256 start;
        int256 drs;
        int256 dys;
        address recipient;
        bool locked;
        uint48 nextEpochTime;
    }
    Info[] public info;

    struct Adjust {
        bool add;
        uint256 rate;
        uint256 target;
    }

    /* ====== CONSTRUCTOR ====== */

    constructor(
        address _treasury,
        address _theo,
        uint48 _epochLength,
        ITheopetraAuthority _authority,
        address _staking
    ) TheopetraAccessControlled(ITheopetraAuthority(_authority)) {
        require(_treasury != address(0), "Zero address: Treasury");
        treasury = ITreasury(_treasury);
        require(_theo != address(0), "Zero address: THEO");
        THEO = IERC20(_theo);
        require(_staking != address(0), "Zero address: Staking");
        staking = _staking;
        epochLength = _epochLength;
    }

    /* ====== PUBLIC FUNCTIONS ====== */

    /**
        @notice send epoch reward to staking contract
        @dev    distribute can only be called by a Staking contract (and the Staking contract will only call if its epoch is over)
                This method distributes rewards to each recipient (minting and sending from the treasury)
                If the current time is greater than `nextEpochTime`, the starting rate is wound-down, and the `nextEpochTime` is updated.
                Wind-down occurs according to the schedules for unlocked and locked tranches where:
                Locked tranches wind-down by 1.5% per epoch (that is, per year) to a minimum of 6% (60000 -- see also `rateDenominator`)
                Unlocked tranches wind-down by 0.5% per epoch (that is, per year) to a minimum of 2% (20000)
     */
    function distribute() external override returns (bool) {
        require(msg.sender == staking, "Only staking");

        // distribute rewards to each recipient
        for (uint256 i = 0; i < info.length; i++) {
            uint256 _rate = nextRewardRate(i);
            if (_rate > 0) {
                ITreasury(treasury).mint(info[i].recipient, nextRewardAt(_rate));
            }
            if (info[i].nextEpochTime <= block.timestamp) {
                if (info[i].locked == false && info[i].start > 20000) {
                    info[i].start = info[i].start.sub(5000);
                } else if (info[i].locked == true && info[i].start > 60000) {
                    info[i].start = info[i].start.sub(15000);
                }
                info[i].nextEpochTime = uint48(uint256(info[i].nextEpochTime).add(uint256(epochLength)));
            }
        }
    }

    function retrieveBounty() external override returns (uint256) {
        require(msg.sender == staking, "Only staking");
        // If the distributor bounty is > 0, mint it for the staking contract.
        if (bounty > 0) {
            treasury.mint(address(staking), bounty);
        }

        return bounty;
    }

    /* ====== VIEW FUNCTIONS ====== */

    /**
        @notice view function for next reward at given rate
        @param _rate uint
        @return uint
     */
    function nextRewardAt(uint256 _rate) public view override returns (uint256) {
        return IERC20(THEO).totalSupply().mul(_rate).div(rateDenominator);
    }

    /**
        @notice view function for next reward for specified address
        @param _recipient address
        @return uint256
     */
    function nextRewardFor(address _recipient) public view override returns (uint256) {
        uint256 reward;
        for (uint256 i = 0; i < info.length; i++) {
            if (info[i].recipient == _recipient) {
                reward = nextRewardAt(nextRewardRate(i));
            }
        }
        return reward;
    }

    /**
     * @notice calculate the next reward rate
       @dev `apyVariable`, is calculated as: APYfixed + SCrs + SCys
            Where APYfixed is the fixed starting rate,
            SCrs is the Control Return for Staking (with 9 decimals): SCrs = Drs * deltaTokenPrice
            SCys is Control Treasury for Staking (with 9 decimals): SCys = Dys * deltaTreasuryYield
            The minimum APYvariable is zero
     * @param _index uint256
     */
    function nextRewardRate(uint256 _index) public view override returns (uint256) {
        int256 apyVariable = (info[_index].start.toInt256())
            .add((ITreasury(treasury).deltaTokenPrice().mul(info[_index].drs)).div(10**9))
            .add((ITreasury(treasury).deltaTreasuryYield().mul(info[_index].dys)).div(10**9));

        if (apyVariable > 0) {
            return uint256(apyVariable);
        } else {
            return 0;
        }
    }

    /* ====== POLICY FUNCTIONS ====== */

    /**
     * @notice set bounty to incentivize keepers
     * @param _bounty uint256
     */
    function setBounty(uint256 _bounty) external override onlyGovernor {
        require(_bounty <= 2e9, "Too much");
        bounty = _bounty;
    }

    /**
        @notice adds recipient for distributions
        @dev    When a recipient is added, the epochLength and current block timestamp is used to calculate when the next epoch should occur
        @param _recipient address
        @param _startRate uint256
        @param _drs       uint256 9 decimal Discount Rate Return Staking. The discount rate applied to the fluctuation of the token price, as a proportion (that is, a percentage in its decimal form), with 9 decimals
        @param _dys       uint256 9 decimial discount rate applied to the fluctuation of the treasury yield, as a proportion (that is, a percentage in its decimal form), with 9 decimals
        @param _locked    bool is the staking tranche locked or unlocked
     */
    function addRecipient(
        address _recipient,
        uint256 _startRate,
        int256 _drs,
        int256 _dys,
        bool _locked
    ) external override onlyGovernor {
        require(_recipient != address(0));
        require(_startRate <= rateDenominator, "Rate cannot exceed denominator");

        info.push(
            Info({
                recipient: _recipient,
                start: _startRate,
                drs: _drs,
                dys: _dys,
                locked: _locked,
                nextEpochTime: uint48((block.timestamp).add(uint256(epochLength)))
            })
        );
    }

    /**
        @notice removes recipient for distributions
        @param _index uint
     */
    function removeRecipient(uint256 _index) external override {
        require(
            msg.sender == authority.governor() || msg.sender == authority.guardian(),
            "Caller is not governor or guardian"
        );
        require(info[_index].recipient != address(0), "Recipient does not exist");
        info[_index].recipient = address(0);
        info[_index].start = 0;
        info[_index].drs = 0;
        info[_index].dys = 0;
    }

    function setDiscountRateStaking(uint256 _index, int256 _drs) public override onlyPolicy {
        info[_index].drs = _drs;
    }

    function setDiscountRateYield(uint256 _index, int256 _dys) public override onlyPolicy {
        info[_index].dys = _dys;
    }
}
