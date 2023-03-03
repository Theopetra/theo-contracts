import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address as treasuryAddress, abi as treasuryAbi} from '../../deployments/mainnet/TheopetraTreasury.json';
import {address, abi} from '../../deployments/mainnet/TheopetraYieldReporter.json'
dotenv.config();

const doTheTest = async () => {

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ['0xF4ABCCd90596C8d11a15986240dcAd09Eb9d6049'],
      });
    
    await hre.network.provider.send("hardhat_setBalance", [
        '0xF4ABCCd90596C8d11a15986240dcAd09Eb9d6049',
        "0x8ac7230489e80000",
    ]);
    
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    let signer = provider.getSigner('0xF4ABCCd90596C8d11a15986240dcAd09Eb9d6049');
    let yieldContract = await ethers.getContractAt(abi, address, signer);

    await yieldContract.reportYield('100');
    await yieldContract.reportYield('101');

    let treasuryContract = await ethers.getContractAt(treasuryAbi, treasuryAddress, signer);

    await treasuryContract.tokenPerformanceUpdate();

    let delta = await treasuryContract.deltaTreasuryYield();

    if (delta > 0) {
        console.log(`Yield reporting successful.`);
    }
    
    console.log('Delta treasury yield = ', delta);
    

};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();