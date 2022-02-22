// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "../Types/ERC20Permit.sol";
import "../Types/VaultOwned.sol";
import "../Types/ERC20.sol";
import "../Libraries/SafeMath.sol";

contract TheopetraERC20Token is ERC20Permit, VaultOwned {
    using SafeMath for uint256;

    uint256 private _initialSupply;

    constructor() ERC20("Theopetra", "THEO", 9) {}

    function getInitialSupply() public view returns (uint256) {
        return _initialSupply;
    }

    /** @dev If `_initialSupply` is not zero, the amount to mint is
     * limited to at most 5% of `_initialSupply`.
     *
     * The first time mint is successfully called, it will update the `_initialSupply`
     * to equal the mint `amount_`
     *
     * Note _initialSupply is initialized to zero
     */
    function mint(address account_, uint256 amount_) external onlyVault {
        uint256 amount = amount_;
        uint256 mintLimit = (_initialSupply * 5) / 100;

        if (_initialSupply == 0) {
            _initialSupply = amount_;
        } else if (_initialSupply != 0 && amount_ > mintLimit) {
            amount = mintLimit;
        }
        _mint(account_, amount);
    }

    function burn(uint256 amount) public virtual {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account_, uint256 amount_) public virtual {
        _burnFrom(account_, amount_);
    }

    function _burnFrom(address account_, uint256 amount_) public virtual {
        uint256 decreasedAllowance_ = allowance(account_, msg.sender).sub(
            amount_,
            "ERC20: burn amount exceeds allowance"
        );

        _approve(account_, msg.sender, decreasedAllowance_);
        _burn(account_, amount_);
    }
}
