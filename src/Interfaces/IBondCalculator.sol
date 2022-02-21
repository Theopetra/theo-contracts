// SPDX-License-Identifier: AGPL-1.0

pragma solidity 0.8.9;

interface IBondCalculator {
  function valuation( address pair_, uint amount_ ) external view returns ( uint _value );
}

