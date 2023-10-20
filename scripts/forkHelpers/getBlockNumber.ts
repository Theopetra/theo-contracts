import { ethers } from 'hardhat';

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
 
    const block = await provider.getBlock(await provider.getBlockNumber())
    
    console.log(`The current block number is: ${block.number} and the timestamp is ${block.timestamp}`);
};

const createNewMarket = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

createNewMarket();