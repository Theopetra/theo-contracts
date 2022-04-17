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
    using SafeMath for *;
    using SafeERC20 for IERC20;
    using SafeERC20 for IsTHEO;
    using SafeERC20 for ITHEO;

    /* ====== VARIABLES ====== */

    Epoch public epoch;

    address public immutable THEO;
    address public immutable sTHEO;
    uint256 public immutable stakingTerm;

    address public distributor;

    address public locker;
    uint256 public totalBonus;

    address public warmupContract;
    uint256 public warmupPeriod;

    uint256 private gonsInWarmup;
    uint256 private slashedGons;

    mapping(address => Claim[]) public stakingInfo;
    mapping(address => bool) private isExternalLocked;

    /* ====== STRUCTS ====== */

    struct Epoch {
        uint256 length;
        uint256 number;
        uint256 end;
        uint256 distribute;
    }

    struct Claim {
        uint256 deposit;
        uint256 gonsInWarmup;
        uint256 warmupExpiry;
        uint256 stakingExpiry;
    }

    constructor(
        address _THEO,
        address _sTHEO,
        uint256 _epochLength,
        uint256 _firstEpochNumber,
        uint256 _firstEpochTime,
        uint256 _stakingTerm,
        address _authority
    ) TheopetraAccessControlled(ITheopetraAuthority(_authority)) {
        definePenalties();
        require(_THEO != address(0), "Invalid address");
        THEO = _THEO;
        require(_sTHEO != address(0), "Invalid address");
        sTHEO = _sTHEO;
        stakingTerm = _stakingTerm;

        epoch = Epoch({ length: _epochLength, number: _firstEpochNumber, end: _firstEpochTime, distribute: 0 });
    }

    /**
        @notice stake THEO to enter warmup
        @dev    if warmupPeriod is 0 and _claim is true, store warmupExpiry 0:
                this is so that the staker cannot retrieve sTHEO from warmup using the stored
                Claim (see also `claim`)
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

        if (!isExternalLocked[_recipient]) {
            require(_recipient == msg.sender, "External deposits for account are locked");
        }

        if (warmupPeriod == 0) {
            // funds are sent if _claim is true
            // and go to warmup if _claim is false
            if (_claim) {
                stakingInfo[_recipient].push(
                    Claim({
                        deposit: _amount,
                        gonsInWarmup: 0,
                        warmupExpiry: 0,
                        stakingExpiry: block.timestamp.add(stakingTerm)
                    })
                );
                _send(_recipient, _amount);
            } else {
                gonsInWarmup = gonsInWarmup.add(IsTHEO(sTHEO).gonsForBalance(_amount));
                stakingInfo[_recipient].push(
                    Claim({
                        deposit: _amount,
                        gonsInWarmup: IsTHEO(sTHEO).gonsForBalance(_amount),
                        warmupExpiry: block.timestamp.add(warmupPeriod),
                        stakingExpiry: block.timestamp.add(stakingTerm)
                    })
                );
                // funds are not sent as they went to warmup
            }
        } else {
            // funds go into warmup
            gonsInWarmup = gonsInWarmup.add(IsTHEO(sTHEO).gonsForBalance(_amount));
            stakingInfo[_recipient].push(
                Claim({
                    deposit: _amount,
                    gonsInWarmup: IsTHEO(sTHEO).gonsForBalance(_amount),
                    warmupExpiry: block.timestamp.add(warmupPeriod),
                    stakingExpiry: block.timestamp.add(stakingTerm)
                })
            );
            // sTheo is not sent as it has went into warmup
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
        if (!isExternalLocked[_recipient]) {
            require(_recipient == msg.sender, "External claims for account are locked");
        }
        for (uint256 i = 0; i < _indexes.length; i++) {
            Claim memory info = stakingInfo[_recipient][_indexes[i]];

            if (block.timestamp >= info.warmupExpiry && info.warmupExpiry != 0) {
                stakingInfo[_recipient][_indexes[i]].gonsInWarmup = 0;

                gonsInWarmup = gonsInWarmup.sub(info.gonsInWarmup);
                return _send(_recipient, IsTHEO(sTHEO).balanceForGons(info.gonsInWarmup));
            }
        }
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
        isExternalLocked[msg.sender] = !isExternalLocked[msg.sender];
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
                // Determine the penalty for removing early. Percentage expressed with 4 decimals
                uint256 percentageComplete = 1000000.sub(
                    ((info.stakingExpiry.sub(block.timestamp)).mul(1000000)).div(stakingTerm)
                );
                uint256 penalty = getPenalty(amount_, percentageComplete.div(10000));

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
        return a == 0 ? m : ((a + m - 1) / m) * m;
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
        if (epoch.end <= block.timestamp) {
            IsTHEO(sTHEO).rebase(epoch.distribute, epoch.number);

            epoch.end = epoch.end.add(epoch.length);
            epoch.number++;

            if (distributor != address(0)) {
                IDistributor(distributor).distribute();
                bounty = IDistributor(distributor).retrieveBounty(); // Will mint THEO for this contract if there exists a bounty
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

    /**
     * @notice             all un-claimed claims for user
     * @param _user        the user to query claims for
     * @return             the indexes of un-claimed claims for the user
     */
    function indexesFor(address _user) public view returns (uint256[] memory) {
        Claim[] memory claims = stakingInfo[_user];

        uint256 length;
        for (uint256 i = 0; i < claims.length; i++) {
            if (isUnClaimed(_user, i)) length++;
        }

        uint256[] memory indexes = new uint256[](length);
        uint256 position;

        for (uint256 i = 0; i < claims.length; i++) {
            if (isUnClaimed(_user, i)) {
                indexes[position] = i;
                position++;
            }
        }

        return indexes;
    }

    /**
     * @notice             determine whether a claim has not yet been claimed
     * @param _user        the user to query claims for
     * @param _index       the index of the claim
     * @return bool        true if the claim has not yet been claimed
     */
    function isUnClaimed(address _user, uint256 _index) public view returns (bool) {
        Claim memory claim = stakingInfo[_user][_index];
        return claim.gonsInWarmup > 0;
    }
}
