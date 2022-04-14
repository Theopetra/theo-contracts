// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.7.5;
import "../Types/TheopetraAccessControlled.sol";
import "hardhat/console.sol";
import "../Libraries/SafeMath.sol";
import "../Libraries/SafeERC20.sol";

import "../Interfaces/IDistributor.sol";
import "../Interfaces/IsTHEO.sol";
import "../Interfaces/ITHEO.sol";

contract TheopetraStaking is TheopetraAccessControlled {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SafeERC20 for IsTHEO;
    using SafeERC20 for ITHEO;

    address public immutable THEO;
    address public immutable sTHEO;
    uint256 public immutable stakingTerm;

    struct Epoch {
        uint256 length;
        uint256 number;
        uint256 endBlock;
        uint256 distribute;
    }
    Epoch public epoch;

    address public distributor;

    address public locker;
    uint256 public totalBonus;

    address public warmupContract;
    uint256 public warmupPeriod;

    uint256 private gonsInWarmup;
    uint256 private slashedGons;

    constructor(
        address _THEO,
        address _sTHEO,
        uint256 _epochLength,
        uint256 _firstEpochNumber,
        uint256 _firstEpochBlock,
        address _authority,
        uint256 _stakingTerm
    ) TheopetraAccessControlled(ITheopetraAuthority(_authority)) {
        definePenalties();
        require(_THEO != address(0), "Invalid address");
        THEO = _THEO;
        require(_sTHEO != address(0), "Invalid address");
        sTHEO = _sTHEO;
        stakingTerm = _stakingTerm;

        epoch = Epoch({ length: _epochLength, number: _firstEpochNumber, endBlock: _firstEpochBlock, distribute: 0 });
    }

    struct Claim {
        uint256 deposit;
        uint256 gonsInWarmup;
        uint256 warmupExpiry;
        uint256 stakingExpiry;
        bool inWarmup;
        bool lock; // prevents malicious delays
    }
    mapping(address => Claim[]) public stakingInfo;

    /**
        @notice stake THEO to enter warmup
        @param _amount uint
        @param _claim bool
        @return uint256
     */
    function stake(
        address _recipient,
        uint256 _amount,
        bool _claim
    ) external returns (uint256) {
        rebase();
        IERC20(THEO).safeTransferFrom(msg.sender, address(this), _amount);

        if (_claim && warmupPeriod != 0) {
            gonsInWarmup += _amount;
            stakingInfo[_recipient].push(
                Claim({
                    deposit: _amount,
                    gonsInWarmup: _amount,
                    warmupExpiry: epoch.endBlock + warmupPeriod,
                    stakingExpiry: block.timestamp + stakingTerm,
                    inWarmup: true,
                    lock: true
                })
            );
        }

        if (_claim && warmupPeriod == 0) {
            uint256 _localAmount = _send(_recipient, _amount);
            return _localAmount;
        }

        return _amount;
    }

    /**
        @notice retrieve sTHEO from warmup
        @param _recipient address
        @param _indexes uint256[]      indexes of the sTHEO to retrieve
        @return amount_                The amount of sTHEO sent
     */
    function claim(address _recipient, uint256[] memory _indexes) public returns (uint256 amount_) {
        uint256 _amount = 0;
        for (uint256 i = 0; i < _indexes.length; i++) {
            Claim memory info = stakingInfo[_recipient][_indexes[i]];

            if (!info.lock) {
                require(_recipient == msg.sender, "External claims for account are locked");
            }

            if (epoch.number >= info.stakingExpiry && info.stakingExpiry != 0) {
                stakingInfo[_recipient][_indexes[i]].gonsInWarmup = 0;

                gonsInWarmup = gonsInWarmup.sub(info.gonsInWarmup);

                _amount.add(_send(_recipient, IsTHEO(sTHEO).balanceForGons(info.gonsInWarmup)));
            }
        }

        return _amount;
    }

    /**
        @notice forfeit sTHEO in warmup and retrieve THEO
     */
    function forfeit() external {
        Claim memory info = stakingInfo[msg.sender][0];
        delete stakingInfo[msg.sender];

        gonsInWarmup = gonsInWarmup.sub(info.gonsInWarmup);

        IERC20(THEO).safeTransfer(msg.sender, info.deposit);
    }

    /**
        @notice prevent new deposits or claims to/from external address (protection from malicious activity)
     */
    function toggleLock() external {
        stakingInfo[msg.sender][0].lock = !stakingInfo[msg.sender][0].lock;
    }

    /**
     * @notice redeem sTHEO for THEO
     * @param _to address
     * @param _amount uint
     * @param _trigger bool
     * @param _indexes uint256[]
     * @return amount_ uint
     */
    function unstake(
        address _to,
        uint256 _amount,
        bool _trigger,
        uint256[] memory _indexes
    ) external returns (uint256 amount_) {
        amount_ = _amount;
        uint256 bounty;
        if (_trigger) {
            bounty = rebase();
        }

        for (uint256 i = 0; i < _indexes.length; i++) {
            Claim memory info = stakingInfo[_to][_indexes[i]];

            if (block.timestamp >= info.stakingExpiry) {
                IsTHEO(sTHEO).safeTransferFrom(msg.sender, address(this), _amount);
                amount_ = amount_.add(bounty);

                require(amount_ <= ITHEO(THEO).balanceOf(address(this)), "Insufficient THEO balance in contract");
                ITHEO(THEO).safeTransfer(_to, amount_);
            } else if (block.timestamp < info.stakingExpiry) {
                // Transfer the staked THEO
                IsTHEO(sTHEO).safeTransferFrom(msg.sender, address(this), _amount);
                // Determine the penalty for removing early
                uint256 penalty = getPenalty(amount_, block.timestamp.div(info.stakingExpiry));
                // uint256 penalty = 0;

                // Add the penalty to slashed gons
                slashedGons = slashedGons.add(penalty);

                // Figure out the amount to return based on this penalty
                amount_ = amount_.sub(penalty);

                // Ensure there is enough to make the transfer
                require(amount_ <= ITHEO(THEO).balanceOf(address(this)), "Insufficient THEO balance in contract");

                // Transfer the THEO to the recipient
                ITHEO(THEO).safeTransfer(_to, amount_);
            }
        }
    }

    mapping(uint256 => uint256) penaltyBands;

    function definePenalties() private {
        definePenalty(1, 20);
        definePenalty(2, 19);
        definePenalty(3, 18);
        definePenalty(4, 17);
        definePenalty(5, 16);
        definePenalty(6, 15);
        definePenalty(7, 14);
        definePenalty(8, 13);
        definePenalty(9, 12);
        definePenalty(10, 11);
        definePenalty(11, 10);
        definePenalty(12, 9);
        definePenalty(13, 8);
        definePenalty(14, 7);
        definePenalty(15, 6);
        definePenalty(16, 5);
        definePenalty(17, 4);
        definePenalty(18, 3);
        definePenalty(19, 2);
        definePenalty(20, 1);
    }

    function definePenalty(uint256 _percentBandMax, uint256 _penalty) private {
        penaltyBands[_percentBandMax] = _penalty;
    }

    function ceil(uint256 a, uint256 m) private view returns (uint256) {
        return ((a + m - 1) / m) * m;
    }

    function getPenalty(uint256 _amount, uint256 stakingTimePercentComplete) public view returns (uint256) {
        if (stakingTimePercentComplete == 100) {
            return 0;
        }

        uint256 penaltyBand = ceil(stakingTimePercentComplete, 5).div(5);

        uint256 penaltyPercent = penaltyBands[penaltyBand];

        return _amount.mul(penaltyPercent).div(100);
    }

    /**
        @notice trigger rebase if epoch over
        @return uint256
     */
    function rebase() public returns (uint256) {
        uint256 bounty;
        if (epoch.endBlock <= block.number) {
            IsTHEO(sTHEO).rebase(epoch.distribute, epoch.number);

            epoch.endBlock = epoch.endBlock.add(epoch.length);
            epoch.number++;

            if (distributor != address(0)) {
                IDistributor(distributor).distribute();
                bounty = IDistributor(distributor).retrieveBounty(); // Will mint ohm for this contract if there exists a bounty
            }

            uint256 balance = contractBalance();
            uint256 staked = IsTHEO(sTHEO).circulatingSupply();

            if (balance <= staked.add(bounty)) {
                epoch.distribute = 0;
            } else {
                epoch.distribute = balance.sub(staked).sub(bounty);
            }
        }
        return bounty;
    }

    /**
        @notice returns contract THEO holdings, including bonuses provided
        @return uint
     */
    function contractBalance() public view returns (uint256) {
        return IERC20(THEO).balanceOf(address(this)).add(totalBonus);
    }

    /**
        @notice provide bonus to locked staking contract
        @param _amount uint
     */
    function giveLockBonus(uint256 _amount) external {
        require(msg.sender == locker);
        totalBonus = totalBonus.add(_amount);
        IERC20(sTHEO).safeTransfer(locker, _amount);
    }

    /**
        @notice reclaim bonus from locked staking contract
        @param _amount uint
     */
    function returnLockBonus(uint256 _amount) external {
        require(msg.sender == locker);
        totalBonus = totalBonus.sub(_amount);
        IERC20(sTHEO).safeTransferFrom(locker, address(this), _amount);
    }

    enum CONTRACTS {
        DISTRIBUTOR,
        WARMUP,
        LOCKER
    }

    /**
        @notice sets the contract address for LP staking
        @param _contract address
     */
    function setContract(CONTRACTS _contract, address _address) external onlyManager {
        if (_contract == CONTRACTS.DISTRIBUTOR) {
            // 0
            distributor = _address;
        } else if (_contract == CONTRACTS.WARMUP) {
            // 1
            require(warmupContract == address(0), "Warmup cannot be set more than once");
            warmupContract = _address;
        } else if (_contract == CONTRACTS.LOCKER) {
            // 2
            require(locker == address(0), "Locker cannot be set more than once");
            locker = _address;
        }
    }

    /**
     * @notice set warmup period for new stakers
     * @param _warmupPeriod uint
     */
    function setWarmup(uint256 _warmupPeriod) external onlyManager {
        warmupPeriod = _warmupPeriod;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice send staker their amount as sTHEO (equal unit as THEO)
     * @param _recipient address
     * @param _amount uint
     */
    function _send(address _recipient, uint256 _amount) internal returns (uint256) {
        IsTHEO(sTHEO).safeTransfer(_recipient, _amount);
        return _amount;
    }

    /* ========== VIEW FUNCTIONS ========== */

    /**
        @notice returns the sTHEO index, which tracks rebase growth
        @return uint
     */
    function index() public view returns (uint256) {
        return IsTHEO(sTHEO).index();
    }

    /**
     * @notice total supply in warmup
     */
    function supplyInWarmup() public view returns (uint256) {
        return IsTHEO(sTHEO).balanceForGons(gonsInWarmup);
    }
}
