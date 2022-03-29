// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.10;

contract TheopetraBondDepositoryMock {
    address private theoBondingCalculator;

    function getTheoBondingCalculator() public view returns (address) {
        return theoBondingCalculator;
    }

    function setTheoBondingCalculator(address _theoBondingCalculator) public {
        theoBondingCalculator = _theoBondingCalculator;
    }
}
