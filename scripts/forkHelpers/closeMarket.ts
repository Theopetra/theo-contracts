import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import {BigNumber} from "ethers";
import { address, abi } from '../../deployments/mainnet/TheopetraBondDepository.json';
dotenv.config();

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const policyAddress = "0x3A051657830B6baadD4523d35061A84eC7Ce636A";

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [policyAddress],
      });

    const signer = provider.getSigner(policyAddress);
      
    const TheopetraBondDepository = new ethers.Contract(address, abi, signer);

    if (!(process.argv.slice(2)[0])) {
        const openMarkets = await TheopetraBondDepository.liveMarkets();
            for (const i in openMarkets) {
                await TheopetraBondDepository.close(openMarkets[i]);
            }
        console.log(`Markets ${openMarkets} have been closed.`);
    } else {
        await TheopetraBondDepository.close((process.argv.slice(2)[0]));
    }
    
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