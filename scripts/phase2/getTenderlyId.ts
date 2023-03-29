import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
dotenv.config();

const main = async () => {
    let FORK_URL = 'https://rpc.tenderly.co/fork/c3665218-3528-4a98-b24a-2700b5ca8754';
    const provider = new ethers.providers.JsonRpcProvider(FORK_URL);
      
    const id = await provider.send('eth_chainId', []);

    console.log(`Chain ID is ${id}`);

};

const advanceTenderly = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

advanceTenderly();