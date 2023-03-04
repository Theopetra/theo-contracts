import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {address as stakingAddress, abi as stakingAbi} from '../../deployments/mainnet/TheopetraStaking.json';
import {address as lockedStakingAddress, abi as lockedStakingAbi} from '../../deployments/mainnet/TheopetraStakingLocked.json';
dotenv.config();

const doTheTest = async () => {
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');
    let [signer, ...signers] =  await ethers.getSigners();
    let unlockedStakingContract = await ethers.getContractAt(stakingAbi, stakingAddress, signer);
    let lockedStakingContract = await ethers.getContractAt(lockedStakingAbi, lockedStakingAddress, signer);
    
    let amountTime = 28800;
    if ((process.argv.slice(2)[0])) {
        amountTime = parseInt(process.argv.slice(2)[0]);
    } 

    await time.increase(amountTime);
    await unlockedStakingContract.rebase();
    await lockedStakingContract.rebase();

    console.log(`Time increased by ${amountTime}. Staking contracts have been rebased.`)

};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();