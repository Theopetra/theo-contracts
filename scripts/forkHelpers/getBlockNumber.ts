import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import {BigNumber} from "ethers";
import { address, abi } from '../../deployments/mainnet/TheopetraBondDepository.json';
dotenv.config();

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8544');
 
    const blockNumber = await provider.getBlockNumber();
    console.log(`The current block number is: ${blockNumber}`);
};

const createNewMarket = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

createNewMarket();