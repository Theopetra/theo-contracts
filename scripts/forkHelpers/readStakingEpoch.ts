import { ethers } from 'hardhat';
import {address as stakingAddress, abi as stakingAbi} from '../../deployments/mainnet/TheopetraStaking.json';
import {address as lockedStakingAddress, abi as lockedStakingAbi} from '../../deployments/mainnet/TheopetraStakingLocked.json';
import { latestBlock } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';

const getEpoch = async () => {
    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const [signer, ...signers] =  await ethers.getSigners();
    const unlockedStakingContract = await ethers.getContractAt(stakingAbi, stakingAddress, signer);
    const lockedStakingContract = await ethers.getContractAt(lockedStakingAbi, lockedStakingAddress, signer)

    const epoch = await unlockedStakingContract.epoch();
    const lockedEpoch = await lockedStakingContract.epoch();
    const blockTime = (await ethers.provider.getBlock(provider._lastBlockNumber)).timestamp;
    
    console.log(`Unlocked Epoch details: ${epoch}.`);
    console.log(`Unlocked Epoch details: ${lockedEpoch}.`);
    console.log(`Current timestamp is ${blockTime}`);

};

const main = async () => {
    try {
        await getEpoch();
    } catch (err) {
        console.log(err);
    }
};

main();