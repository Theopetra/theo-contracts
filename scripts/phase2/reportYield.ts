import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {address as treasuryAddress, abi as treasuryAbi} from '../../deployments/mainnet/TheopetraTreasury.json';
import {address as yieldAddress, abi as yieldAbi} from '../../deployments/mainnet/TheopetraYieldReporter.json'
import {address as calculatorAddress, abi as calculatorAbi} from '../../deployments/mainnet/NewBondingCalculatorMock.json';
dotenv.config();

const doTheTest = async () => {

    let manager = '0xF4ABCCd90596C8d11a15986240dcAd09Eb9d6049';
    let governor = '0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A';

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [manager],
      });
    
    await hre.network.provider.send("hardhat_setBalance", [
        manager,
        "0x8ac7230489e80000",
    ]);
    
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    let signer = provider.getSigner(manager);
    let yieldContract = await ethers.getContractAt(yieldAbi, yieldAddress, signer);

    await yieldContract.reportYield('1000');
    await yieldContract.reportYield('1001');

    let treasuryContract = await ethers.getContractAt(treasuryAbi, treasuryAddress, signer);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governor],
      });
    
    let govSigner = provider.getSigner(governor);

    let calculatorContract = await ethers.getContractAt(calculatorAbi, calculatorAddress, govSigner);

    await calculatorContract.setPerformanceTokenAmount(100000);

    await treasuryContract.tokenPerformanceUpdate();

    await time.increase(28900);

    await calculatorContract.updatePerformanceTokenAmount(10);

    await treasuryContract.tokenPerformanceUpdate();

    let deltaY = await treasuryContract.deltaTreasuryYield();

    if (deltaY > 0) {
        console.log(`Yield reporting successful.`);
    };
    
    console.log('Delta treasury yield = ', deltaY);

    let deltaP = await treasuryContract.deltaTokenPrice();

    if (deltaP > 0) {
        console.log(`Performance update successful.`);
    };
    
    console.log('Delta treasury price = ', deltaP);

};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();