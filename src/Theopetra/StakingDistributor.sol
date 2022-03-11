// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.7.5;

import "../Types/TheopetraAccessControlled.sol";

import "../Libraries/SafeERC20.sol";
import "../Libraries/SafeMath.sol";

import "../Interfaces/ITreasury.sol";
import "../Interfaces/IERC20.sol";
import "../Interfaces/IDistributor.sol";

contract StakingDistributor is IDistributor, TheopetraAccessControlled {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ====== VARIABLES ====== */

    address public immutable THEO;
    address public immutable treasury;

    uint256 public immutable epochLength;
    uint256 public nextEpochBlock;

    mapping(uint256 => Adjust) public adjustments;

    /* ====== STRUCTS ====== */

    struct Info {
        uint256 rate; // in ten-thousandths ( 5000 = 0.5% )
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
        ITheopetraAuthority _authority
    ) TheopetraAccessControlled(_authority) {
        require(_treasury != address(0));
        treasury = _treasury;
        require(_theo != address(0));
        THEO = _theo;
        epochLength = _epochLength;
        nextEpochBlock = _nextEpochBlock;
    }

    /* ====== PUBLIC FUNCTIONS ====== */

    /**
        @notice send epoch reward to staking contract
     */
    function distribute() external override returns (bool) {
        if (nextEpochBlock <= block.number) {
            nextEpochBlock = nextEpochBlock.add(epochLength); // set next epoch block

            // distribute rewards to each recipient
            for (uint256 i = 0; i < info.length; i++) {
                if (info[i].rate > 0) {
                    ITreasury(treasury).mint(info[i].recipient, nextRewardAt(info[i].rate)); // mint and send from treasury
                    adjust(i); // check for adjustment
                }
            }
            return true;
        } else {
            return false;
        }
    }

    /* ====== INTERNAL FUNCTIONS ====== */

    /**
        @notice increment reward rate for collector
     */
    function adjust(uint256 _index) internal {
        Adjust memory adjustment = adjustments[_index];
        if (adjustment.rate != 0) {
            if (adjustment.add) {
                // if rate should increase
                info[_index].rate = info[_index].rate.add(adjustment.rate); // raise rate
                if (info[_index].rate >= adjustment.target) {
                    // if target met
                    adjustments[_index].rate = 0; // turn off adjustment
                }
            } else {
                // if rate should decrease
                info[_index].rate = info[_index].rate.sub(adjustment.rate); // lower rate
                if (info[_index].rate <= adjustment.target) {
                    // if target met
                    adjustments[_index].rate = 0; // turn off adjustment
                }
            }
        }
    }

    /* ====== VIEW FUNCTIONS ====== */

    /**
        @notice view function for next reward at given rate
        @param _rate uint
        @return uint
     */
    function nextRewardAt(uint256 _rate) public view override returns (uint256) {
        return IERC20(THEO).totalSupply().mul(_rate).div(1000000);
    }

    /**
        @notice view function for next reward for specified address
        @param _recipient address
        @return uint
     */
    function nextRewardFor(address _recipient) public view override returns (uint256) {
        uint256 reward;
        for (uint256 i = 0; i < info.length; i++) {
            if (info[i].recipient == _recipient) {
                reward = nextRewardAt(info[i].rate);
            }
        }
        return reward;
    }

    /* ====== POLICY FUNCTIONS ====== */

    /**
        @notice adds recipient for distributions
        @param _recipient address
        @param _rewardRate uint
     */
    function addRecipient(address _recipient, uint256 _rewardRate) external override onlyPolicy {
        require(_recipient != address(0));
        info.push(Info({ recipient: _recipient, rate: _rewardRate }));
    }

    /**
        @notice removes recipient for distributions
        @param _index uint
        @param _recipient address
     */
    function removeRecipient(uint256 _index, address _recipient) external override onlyPolicy {
        require(_recipient == info[_index].recipient);
        info[_index].recipient = address(0);
        info[_index].rate = 0;
    }

    /**
        @notice set adjustment info for a collector's reward rate
        @param _index uint
        @param _add bool
        @param _rate uint
        @param _target uint
     */
    function setAdjustment(
        uint256 _index,
        bool _add,
        uint256 _rate,
        uint256 _target
    ) external override onlyPolicy {
        adjustments[_index] = Adjust({ add: _add, rate: _rate, target: _target });
    }
}
