// SPDX-License-Identifier: AGPL-1.0

pragma solidity >=0.7.5 <=0.8.10;

interface IBondCalculator {
    function valuation(address pair_, uint256 amount_) external view returns (uint256 _value);
}
