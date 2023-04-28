import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {address as stakingAddress, abi as stakingAbi} from '../../deployments/mainnet/TheopetraStaking.json';
import {address as lockedStakingAddress, abi as lockedStakingAbi} from '../../deployments/mainnet/TheopetraStakingLocked.json';
import {address as sTheoAddress, abi as sTheoAbi} from '../../deployments/mainnet/sTheopetra.json';
import {address as pTheoAddress, abi as pTheoAbi} from '../../deployments/mainnet/pTheopetra.json';
import { latestBlock } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
dotenv.config();

const timeAndRebase = async () => {
    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const [signer, ...signers] =  await ethers.getSigners();
    const unlockedStakingContract = await ethers.getContractAt(stakingAbi, stakingAddress, signer);
    const lockedStakingContract = await ethers.getContractAt(lockedStakingAbi, lockedStakingAddress, signer);

    const sTheo = await ethers.getContractAt(sTheoAbi, sTheoAddress, signer);
    const pTheo = await ethers.getContractAt(pTheoAbi, pTheoAddress, signer);

    let periods = 1;
    if ((process.argv.slice(2)[0])) {
        periods = parseInt(process.argv.slice(2)[0]);
    } 

    await time.increase(periods * 28800);

    for (let i = 0; i < periods; i++) {
        await unlockedStakingContract.rebase();
        await lockedStakingContract.rebase();
    }

    console.log(`Time increased by ${periods * 28800} seconds. Staking contracts have been rebased.`);
    const currentBlock = await provider.getBlock(latestBlock());
    console.log(`Current time is now ${currentBlock.timestamp}`);

    const circulatingSTheo = await sTheo.circulatingSupply();
    const circulatingPTheo = await pTheo.circulatingSupply();

    console.log(`sTHEO supply: ${circulatingSTheo}, pTHEO supply: ${circulatingPTheo}`);


};

const main = async () => {
    try {
        await timeAndRebase();
    } catch (err) {
        console.log(err);
    }
};

main();