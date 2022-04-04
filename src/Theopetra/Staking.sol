// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.7.5;

import "../Types/TheopetraAccessControlled.sol";

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

    struct Epoch {
        uint256 length;
        uint256 number;
        uint256 end;
        uint256 distribute;
    }
    Epoch public epoch;

    address public distributor;

    address public locker;
    uint256 public totalBonus;

    address public warmupContract;
    uint256 public warmupPeriod;

    uint256 private gonsInWarmup;

    constructor(
        address _THEO,
        address _sTHEO,
        uint256 _epochLength,
        uint256 _firstEpochNumber,
        uint256 _firstEpochTime,
        address _authority
    ) TheopetraAccessControlled(ITheopetraAuthority(_authority)) {
        require(_THEO != address(0), "Invalid address");
        THEO = _THEO;
        require(_sTHEO != address(0), "Invalid address");
        sTHEO = _sTHEO;

        epoch = Epoch({ length: _epochLength, number: _firstEpochNumber, end: _firstEpochTime, distribute: 0 });
    }

    struct Claim {
        uint256 deposit;
        uint256 gons;
        uint256 expiry;
        bool lock; // prevents malicious delays
    }
    mapping(address => Claim) public warmupInfo;

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

        if (_claim && warmupPeriod == 0) {
            return _send(_recipient, _amount);
        } else {
            Claim memory info = warmupInfo[_recipient];

            if (!info.lock) {
                require(_recipient == msg.sender, "External deposits for account are locked");
            }

            warmupInfo[_recipient] = Claim({
                deposit: info.deposit.add(_amount),
                gons: info.gons.add(IsTHEO(sTHEO).gonsForBalance(_amount)),
                expiry: epoch.number.add(warmupPeriod),
                lock: info.lock
            });

            gonsInWarmup = gonsInWarmup.add(IsTHEO(sTHEO).gonsForBalance(_amount));

            return _amount;
        }
    }

    /**
        @notice retrieve sTHEO from warmup
        @param _recipient address
     */
    function claim(address _recipient) public returns (uint256) {
        Claim memory info = warmupInfo[_recipient];

        if (!info.lock) {
            require(_recipient == msg.sender, "External claims for account are locked");
        }

        if (epoch.number >= info.expiry && info.expiry != 0) {
            delete warmupInfo[_recipient];

            gonsInWarmup = gonsInWarmup.sub(info.gons);

            return _send(_recipient, IsTHEO(sTHEO).balanceForGons(info.gons));
        }

        return 0;
    }

    /**
        @notice forfeit sTHEO in warmup and retrieve THEO
     */
    function forfeit() external {
        Claim memory info = warmupInfo[msg.sender];
        delete warmupInfo[msg.sender];

        gonsInWarmup = gonsInWarmup.sub(info.gons);

        IERC20(THEO).safeTransfer(msg.sender, info.deposit);
    }

    /**
        @notice prevent new deposits or claims to/from external address (protection from malicious activity)
     */
    function toggleLock() external {
        warmupInfo[msg.sender].lock = !warmupInfo[msg.sender].lock;
    }

    /**
     * @notice redeem sTHEO for THEO
     * @param _to address
     * @param _amount uint
     * @param _trigger bool
     * @return amount_ uint
     */
    function unstake(
        address _to,
        uint256 _amount,
        bool _trigger
    ) external returns (uint256 amount_) {
        amount_ = _amount;
        uint256 bounty;
        if (_trigger) {
            bounty = rebase();
        }

        IsTHEO(sTHEO).safeTransferFrom(msg.sender, address(this), _amount);
        amount_ = amount_.add(bounty);

        require(amount_ <= ITHEO(THEO).balanceOf(address(this)), "Insufficient THEO balance in contract");
        ITHEO(THEO).safeTransfer(_to, amount_);
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
