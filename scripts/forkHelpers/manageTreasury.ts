import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import {BigNumber} from "ethers";
import { address, abi } from '../../deployments/mainnet/TheopetraTreasury.json';
import { address as wethAddress, abi as wethAbi} from '../phase2/WETH9.json';
dotenv.config();

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const governorAddress = "0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A";

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governorAddress],
      });

    const signer = provider.getSigner(governorAddress);
      
    const TheopetraTreasury = new ethers.Contract(address, abi, signer);
    const WETH9 = new ethers.Contract(wethAddress, wethAbi, signer);

    let token = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

    await TheopetraTreasury.manage(token, process.argv.slice(2)[0])

    const treasuryWeth = await WETH9.balanceOf(TheopetraTreasury.address);
    const govWeth = await WETH9.balanceOf(governorAddress);

    console.log(`Treasury balance is ${treasuryWeth}, Governor wallet balance is ${govWeth}`);

};

const manageTreasury = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

manageTreasury();