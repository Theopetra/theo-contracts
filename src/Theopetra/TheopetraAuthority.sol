// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.7.5;

import "../Interfaces/ITheopetraAuthority.sol";
import "../Types/TheopetraAccessControlled.sol";

contract TheopetraAuthority is ITheopetraAuthority, TheopetraAccessControlled {
    /* ========== STATE VARIABLES ========== */

    address public override governor;

    address public override guardian;

    address public override policy;

    address public override manager;

    address public override vault;

    address public override whitelistSigner;

    address public newGovernor;

    address public newGuardian;

    address public newPolicy;

    address public newManager;

    address public newVault;

    address public newWhitelistSigner;

    /* ========== Constructor ========== */

    constructor(
        address _governor,
        address _guardian,
        address _policy,
        address _manager,
        address _vault,
        address _whitelistSigner
    ) TheopetraAccessControlled(ITheopetraAuthority(address(this))) {
        governor = _governor;
        emit GovernorPushed(address(0), governor, true);
        guardian = _guardian;
        emit GuardianPushed(address(0), guardian, true);
        policy = _policy;
        emit PolicyPushed(address(0), policy, true);
        manager = _manager;
        emit ManagerPushed(address(0), manager, true);
        vault = _vault;
        emit VaultPushed(address(0), vault, true);
        whitelistSigner = _whitelistSigner;
        emit SignerPushed(address(0), whitelistSigner, true);
    }

    /* ========== GOV ONLY ========== */

    function pushGovernor(address _newGovernor, bool _effectiveImmediately) external onlyGovernor {
        if (_effectiveImmediately) governor = _newGovernor;
        newGovernor = _newGovernor;
        emit GovernorPushed(governor, newGovernor, _effectiveImmediately);
    }

    function pushGuardian(address _newGuardian, bool _effectiveImmediately) external onlyGovernor {
        if (_effectiveImmediately) guardian = _newGuardian;
        newGuardian = _newGuardian;
        emit GuardianPushed(guardian, newGuardian, _effectiveImmediately);
    }

    function pushPolicy(address _newPolicy, bool _effectiveImmediately) external onlyGovernor {
        if (_effectiveImmediately) policy = _newPolicy;
        newPolicy = _newPolicy;
        emit PolicyPushed(policy, newPolicy, _effectiveImmediately);
    }

    function pushManager(address _newManager, bool _effectiveImmediately) external onlyGovernor {
        if (_effectiveImmediately) manager = _newManager;
        newManager = _newManager;
        emit ManagerPushed(manager, newManager, _effectiveImmediately);
    }

    function pushVault(address _newVault, bool _effectiveImmediately) external onlyGovernor {
        if (_effectiveImmediately) vault = _newVault;
        newVault = _newVault;
        emit VaultPushed(vault, newVault, _effectiveImmediately);
    }

    function pushWhitelistSigner(address _newWhitelistSigner, bool _effectiveImmediately) external onlyGovernor {
        if (_effectiveImmediately) whitelistSigner = _newWhitelistSigner;
        newWhitelistSigner = _newWhitelistSigner;
        emit SignerPushed(whitelistSigner, newWhitelistSigner, _effectiveImmediately);
    }

    /* ========== PENDING ROLE ONLY ========== */

    function pullGovernor() external {
        require(msg.sender == newGovernor, "!newGovernor");
        emit GovernorPulled(governor, newGovernor);
        governor = newGovernor;
    }

    function pullGuardian() external {
        require(msg.sender == newGuardian, "!newGuard");
        emit GuardianPulled(guardian, newGuardian);
        guardian = newGuardian;
    }

    function pullPolicy() external {
        require(msg.sender == newPolicy, "!newPolicy");
        emit PolicyPulled(policy, newPolicy);
        policy = newPolicy;
    }

    function pullManager() external {
        require(msg.sender == newManager, "!newManager");
        emit ManagerPulled(manager, newManager);
        manager = newManager;
    }

    function pullVault() external {
        require(msg.sender == newVault, "!newVault");
        emit VaultPulled(vault, newVault);
        vault = newVault;
    }

    function pullWhitelistSigner() external {
        require(msg.sender == newWhitelistSigner, "!newWhitelistSigner");
        emit SignerPulled(whitelistSigner, newWhitelistSigner);
        whitelistSigner = newWhitelistSigner;
    }
}
