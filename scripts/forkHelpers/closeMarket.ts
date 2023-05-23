import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import {BigNumber} from "ethers";
import { address, abi } from '../../deployments/mainnet/TheopetraBondDepository.json';
dotenv.config();

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const policyAddress = "0x3A051657830B6baadD4523d35061A84eC7Ce636A";

    let id = 0;

    if ((process.argv.slice(2)[0])) {
        id = parseInt(process.argv.slice(2)[0]);
    };

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [policyAddress],
      });

    const signer = provider.getSigner(policyAddress);
      
    const TheopetraBondDepository = new ethers.Contract(address, abi, signer);

    await TheopetraBondDepository.close(id);

    const markets = await TheopetraBondDepository.liveMarkets();

    console.log(`Live market IDs are: ${markets}`);

};

const createNewMarket = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

createNewMarket();