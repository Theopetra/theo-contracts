import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
dotenv.config();

const main = async () => {
    let FORK_URL = 'https://rpc.tenderly.co/fork/5fd59a6e-ae86-4328-8792-1b8b85d8678f';
    const provider = new ethers.providers.JsonRpcProvider(FORK_URL);
    
    let amountTime = 100;
    if ((process.argv.slice(2)[0])) {
        amountTime = parseInt(process.argv.slice(2)[0]);
    } 

    const params = [
        ethers.utils.hexValue(amountTime) // hex encoded number of blocks to increase
    ];
      
    await provider.send('evm_increaseBlocks', params)

    const b = await provider.getBlockNumber();

    console.log(`Block advanced by ${amountTime} to ${b}`);

};

const advanceTenderly = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

advanceTenderly();