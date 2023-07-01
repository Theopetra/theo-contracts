import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address as theoAddress, abi as theoAbi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import {address as stakingAddress, abi as stakingAbi} from '../../deployments/mainnet/TheopetraStaking.json';
import {address as lockedStakingAddress, abi as lockedStakingAbi} from '../../deployments/mainnet/TheopetraStakingLocked.json';
dotenv.config();

const doTheTest = async () => {

    //Setup default user and impersonate calls
    let user = '0x06f3a31e675ddFEBafC87435686E63C156E2236C'

    if (ethers.utils.isAddress(process.argv.slice(2)[0])) {
        user = process.argv.slice(2)[0];
    } 

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [user],
    });

    await hre.network.provider.send("hardhat_setBalance", [
        user,
        "0x8ac7230489e80000",
    ]);

    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    const signer = provider.getSigner(user);
    const amountToStake = 1_000_000_000_000;

    //Get contracts
    const theoContract = await ethers.getContractAt(theoAbi, theoAddress, signer);
    const stakingContract = await ethers.getContractAt(stakingAbi, stakingAddress, signer);
    const lockedStakingContract = await ethers.getContractAt(lockedStakingAbi, lockedStakingAddress, signer);

    await theoContract.approve(stakingAddress, amountToStake);
    const unlockedStake = async () => {
        await stakingContract.stake(user, amountToStake, false)
    };
    await theoContract.approve(lockedStakingAddress, amountToStake);
    const lockedStake = async () => { 
        await lockedStakingContract.stake(user, amountToStake, false)
    };

    await unlockedStake();
    await lockedStake();

    console.log("$THEO Staked.")

};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();