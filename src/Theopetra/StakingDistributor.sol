// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.7.5;

import "../Types/TheopetraAccessControlled.sol";

import "../Libraries/SafeERC20.sol";
import "../Libraries/SafeMath.sol";

import "../Interfaces/ITreasury.sol";
import "../Interfaces/IERC20.sol";
import "../Interfaces/IDistributor.sol";

contract StakingDistributor is IDistributor, TheopetraAccessControlled {
    /* ========== DEPENDENCIES ========== */

    using SafeMath for uint256;
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
                Info::scrs is the Control Return for Staking (see nextRewardRate)
                Info::scys is the Control Treasury for Staking (see nextRewardRate)
     */
    struct Info {
        uint64 start;
        int64 scrs;
        int64 scys;
        address recipient;
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
        @dev    distribute sets the next epoch block, then distributes rewards to each recipient
                (minting and sending from the treasury)
                It then adjusts SCrs and SCys (see `adjust`), ahead of the next distribution
     */
    function distribute() external override returns (bool) {
        require(msg.sender == staking, "Only staking");
        if (nextEpochBlock <= block.number) {
            nextEpochBlock = nextEpochBlock.add(epochLength); //

            // distribute rewards to each recipient
            for (uint256 i = 0; i < info.length; i++) {
                uint256 apyVariable = apyVariable(i);
                if (apyVariable > 0) {
                    ITreasury(treasury).mint(info[i].recipient, nextRewardAt(apyVariable));
                    adjust(i); // check for adjustment
                }
            }
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

        info[_index].scrs = 1_000_000_000;
        info[_index].scys = 2_000_000_000;
        // Adjust memory adjustment = adjustments[_index];
        // if (adjustment.rate != 0) {
        //     if (adjustment.add) {
        //         // if rate should increase
        //         info[_index].rate = info[_index].rate.add(adjustment.rate); // raise rate
        //         if (info[_index].rate >= adjustment.target) {
        //             // if target met
        //             adjustments[_index].rate = 0; // turn off adjustment
        //             info[_index].rate = adjustment.target; // set to target
        //         }
        //     } else {
        //         // if rate should decrease
        //         if (info[_index].rate > adjustment.rate) {
        //             // protect from underflow
        //             info[_index].rate = info[_index].rate.sub(adjustment.rate); // lower rate
        //         } else {
        //             info[_index].rate = 0;
        //         }
        //         if (info[_index].rate <= adjustment.target) {
        //             // if target met
        //             adjustments[_index].rate = 0; // turn off adjustment
        //             info[_index].rate = adjustment.target; // set to target
        //         }
        //     }
        // }
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
        @param _recipient address
        @param _startRate uint
     */
    function addRecipient(address _recipient, uint64 _startRate, int64 _scrs, int64 _scys) external override onlyGovernor {
        require(_recipient != address(0));
        require(_startRate <= rateDenominator, "Rate cannot exceed denominator");
        info.push(Info({ recipient: _recipient, start: _startRate, scrs: _scrs, scys: _scys }));
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
        int256 apyVariable = int128(info[i].start) + info[i].scrs + info[i].scys;
        return apyVariable > 0 ? uint256(apyVariable) : 0;
    }
}
