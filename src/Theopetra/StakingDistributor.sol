// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.0;

import "../Types/TheopetraAccessControlled.sol";

import "../Libraries/SafeERC20.sol";

import "../Interfaces/ITreasury.sol";
import "../Interfaces/IERC20.sol";
import "../Interfaces/IDistributor.sol";

contract StakingDistributor is IDistributor, TheopetraAccessControlled {
    /* ========== DEPENDENCIES ========== */

    using SafeERC20 for IERC20;

    /* ====== VARIABLES ====== */

    IERC20 private immutable THEO;
    ITreasury private immutable treasury;
    address private immutable staking;

    uint256 public immutable epochLength;
    uint256 public nextEpochBlock;

    mapping(uint256 => Adjust) public adjustments;
    uint256 public override bounty;

    uint256 private immutable rateDenominator = 1_000_000;

    /* ====== STRUCTS ====== */

    /**
        @notice starting rate and recipient for rewards
        @dev    Info::start is the starting rate for rewards in ten-thousandsths (2000 = 0.2%);
                Info::recipient is the recipient staking contract for rewards
                Info::scrs is the Control Return for Staking (see nextRewardRate), with 9 decimals
                Info::scys is the Control Treasury for Staking (see nextRewardRate), with 9 decimals
                Info::drs is the Discount Rate Return Staking. The discount rate applied to the fluctuation of the token price, as a proportion (that is, a percentage in its decimal form), with 9 decimals
                Info::dys is the discount rate applied to the fluctuation of the treasury yield, as a proportion (that is, a percentage in its decimal form), with 9 decimals

     */
    struct Info {
        uint256 start;
        int256 scrs;
        int256 scys;
        int256 drs;
        int256 dys;
        address recipient;
        bool locked;
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
        uint256 _epochLength,
        uint256 _nextEpochBlock,
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
        nextEpochBlock = _nextEpochBlock;
    }

    /* ====== PUBLIC FUNCTIONS ====== */

    /**
        @notice send epoch reward to staking contract
        @dev    distribute can only be called by a Staking contract (and the Staking contract will only call if its epoch is over)
                This method distributes rewards to each recipient (minting and sending from the treasury)
                It then adjusts SCrs and SCys (see `adjust`), ahead of the next distribution
     */
    function distribute() external override returns (bool) {
        require(msg.sender == staking, "Only staking");
        if (nextEpochBlock <= block.number) {
            nextEpochBlock = nextEpochBlock + epochLength; //

            // distribute rewards to each recipient
            for (uint256 i = 0; i < info.length; i++) {
                uint256 apyVariable = apyVariable(i);
                if (apyVariable > 0) {
                    ITreasury(treasury).mint(info[i].recipient, nextRewardAt(apyVariable));
                    adjust(i); // check for adjustment
                }
            }

            // Check for wind-down in start percentage and max
            // if timestamp > nextEpochTime and startPercentage >6% then:
            // reduce start percentage
            // update nextEpochTime to be nextEpochTime + epochLength
            return true;
        } else {
            return false;
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

    /* ====== INTERNAL FUNCTIONS ====== */

    /**
     * @notice adjust Bond Control Return for Staking (SCrs) Bond Control Treasury for Staking (SCys)
     * @dev
     */
    function adjust(uint256 _index) internal {
        info[_index].scrs = (info[_index].drs * ITreasury(treasury).deltaTokenPrice()) / 10**9;
        info[_index].scys = (info[_index].dys * ITreasury(treasury).deltaTreasuryYield()) / 10**9;
    }

    /* ====== VIEW FUNCTIONS ====== */

    /**
        @notice view function for next reward at given rate
        @param _rate uint
        @return uint
     */
    function nextRewardAt(uint256 _rate) public view override returns (uint256) {
        return IERC20(THEO).totalSupply() * (_rate) / (rateDenominator);
    }

    /**
        @notice view function for next reward for specified address
        @dev    APYvariable, passed into `nextRewardAt` is calculated as:
                APYfixed + SCrs + SCys
                Where APYfixed is the fixed starting rate,
                SCrs is the Control Return for Staking
                SCys is Control Treasury for Staking
        @param _recipient address
        @return uint256
     */
    function nextRewardFor(address _recipient) public view override returns (uint256) {
        uint256 reward;
        for (uint256 i = 0; i < info.length; i++) {
            if (info[i].recipient == _recipient) {
                reward = nextRewardAt(apyVariable(i));
            }
        }
        return reward;
    }

    function nextRewardRate(uint256 _index) internal {
        int256 deltaTokenPrice = ITreasury(treasury).deltaTokenPrice();
        int256 deltaTreasuryYield = ITreasury(treasury).deltaTreasuryYield();
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
        @dev    _scrs and _scys are both with 9 decimals. Their calculation includes division by 10**9, as multiplicands also each have 9 decimals.
        @param _recipient address
        @param _startRate uint256
        @param _drs       uint256 9 decimal Discount Rate Return Staking. The discount rate applied to the fluctuation of the token price, as a proportion (that is, a percentage in its decimal form), with 9 decimals
        @param _dys       uint256 9 decimial discount rate applied to the fluctuation of the treasury yield, as a proportion (that is, a percentage in its decimal form), with 9 decimals
        @param _locked    bool is the staking tranche locked or unlocked
     */
    function addRecipient(address _recipient, uint256 _startRate, int256 _drs, int256 _dys, bool _locked) external override onlyGovernor {
        require(_recipient != address(0));
        require(_startRate <= rateDenominator, "Rate cannot exceed denominator");

        int256 _scrs = (_drs * ITreasury(treasury).deltaTokenPrice()) / 10**9;
        int256 _scys = (_dys * ITreasury(treasury).deltaTreasuryYield()) / 10**9;

        info.push(Info({ recipient: _recipient, start: _startRate, scrs: _scrs, scys: _scys, drs: _drs, dys: _dys, locked: _locked }));
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
        info[_index].scrs = 0;
        info[_index].scys = 0;
    }

    // /**
    //     @notice set adjustment info for a collector's reward rate
    //     @param _index uint
    //     @param _add bool
    //     @param _rate uint
    //     @param _target uint
    //  */
    // function setAdjustment(
    //     uint256 _index,
    //     bool _add,
    //     uint256 _rate,
    //     uint256 _target
    // ) external override {
    //     require(
    //         msg.sender == authority.governor() || msg.sender == authority.guardian(),
    //         "Caller is not governor or guardian"
    //     );
    //     require(info[_index].recipient != address(0), "Recipient does not exist");

    //     if (msg.sender == authority.guardian()) {
    //         require(_rate <= info[_index].rate.mul(25).div(1000), "Limiter: cannot adjust by >2.5%");
    //     }

    //     if (!_add) {
    //         require(_rate <= info[_index].rate, "Cannot decrease rate by more than it already is");
    //     }

    //     adjustments[_index] = Adjust({ add: _add, rate: _rate, target: _target });
    // }

    function apyVariable(uint256 i) internal view returns (uint256) {
        int256 apyVariable = int256(info[i].start) + info[i].scrs + info[i].scys;
        return apyVariable > 0 ? uint256(apyVariable) : 0;
    }
}
