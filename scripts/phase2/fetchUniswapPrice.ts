import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/TheopetraERC20Token.json';
dotenv.config();

const doTheTest = async () => {
    let [signer, ...signers] =  await ethers.getSigners();
    
    const uniswapV3Pool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
    let contract = await ethers.getContractAt(abi, address, signer);

    let name = await contract.name();
    let symbol = await contract.symbol();
    let supply = await contract.totalSupply();
    let decimals = await contract.decimals();
    console.log(`${name}: ${symbol}`);
    console.log(`totalSupply ${supply}, decimals: ${decimals}`);
};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();