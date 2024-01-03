// SPDX-License-Identifier: AGPL-3.0
// Derived from OpenZeppelin Contracts (v5.0.0) (token/ERC20/extensions/ERC20Wrapper.sol)

pragma solidity ^0.8.20;

import {IERC20, IERC20Metadata, ERC20} from "openzeppelin5/token/ERC20/ERC20.sol";

import {SafeERC20} from "openzeppelin5/token/ERC20/utils/SafeERC20.sol";
import {ITHEO} from "../Interfaces/ITHEO.sol";

/**
 * @dev Extension of the ERC-20 token contract to support token wrapping.
 * 
 */
contract YimbyERC20 is ERC20 {
    ITHEO private immutable _underlying;

    /**
     * @dev The underlying token couldn't be wrapped.
     */
    error ERC20InvalidUnderlying(address token);

    constructor(ITHEO underlyingToken) ERC20("YIMBY", "YIMBY") {
        if (address(underlyingToken) == address(this)) {
            revert ERC20InvalidUnderlying(address(this));
        }
        _underlying = underlyingToken;
    }

    /**
     * @dev See {ERC20-decimals}.
     */
    function decimals() public view virtual override returns (uint8) {
        try IERC20Metadata(address(_underlying)).decimals() returns (uint8 value) {
            return value;
        } catch {
            return super.decimals();
        }
    }

    /**
     * @dev Returns the address of the underlying ERC-20 token that is being wrapped.
     */
    function underlying() public view returns (ITHEO) {
        return _underlying;
    }

    /**
     * @dev Allow a user to deposit underlying tokens and mint the corresponding number of wrapped tokens.
     */
    function depositFor(address account, uint256 value) public virtual returns (bool) {
        address sender = _msgSender();
        if (sender == address(this)) {
            revert ERC20InvalidSender(address(this));
        }
        if (account == address(this)) {
            revert ERC20InvalidReceiver(account);
        }
        // SafeERC20.safeTransferFrom(_underlying, sender, address(this), value);
        _underlying.burnFrom(sender, value);
        _mint(account, value);
        return true;
    }

    /**
     * @dev Mint wrapped token to cover any underlyingTokens that would have been transferred by mistake or acquired from
     * rebasing mechanisms. Internal function that can be exposed with access control if desired.
     */
    function _recover(address account) internal virtual returns (uint256) {
        uint256 value = _underlying.balanceOf(address(this)) - totalSupply();
        _mint(account, value);
        return value;
    }
}