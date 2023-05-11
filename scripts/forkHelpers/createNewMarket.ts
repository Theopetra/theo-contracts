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

    await TheopetraBondDepository.create(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
        [BigNumber.from("3334000000000000000000"), BigNumber.from("55374555"), BigNumber.from(10000)],
        [true, true],
        [1209600, 1714092686],
        [5000000000, 20000000000, 0, 0],
        [28800, 28800]
    );

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