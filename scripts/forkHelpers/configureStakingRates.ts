import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/StakingDistributor.json';
const BigNumber = ethers.BigNumber;
dotenv.config();

const adjustStakingRates = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');

    const governorAddress = "0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A";

    const signer = provider.getSigner(governorAddress);
    const contract = await ethers.getContractAt(abi, address, signer);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governorAddress],
      });



    // await contract.removeRecipient(0);
    // await contract.removeRecipient(1);

    await contract.addRecipient("0x93E137f18f5603CBBa0d1a8b2b2bc585B229D485", 44876, 0, 0, false);
    await contract.addRecipient("0x3b41c244Be7Fe35ac4fFD80615C5524704292263", 151176, 0, 0, true);
    
    const unlockedRates = await contract.info(2);
    const lockedRates = await contract.info(3);

    console.log(`Updated staking rates to`, unlockedRates, lockedRates);
    console.log()
    // const newBalance = await contract.balanceOf(user);
    // console.log(`$THEO Balance of address: ${user} is ${newBalance}`)
};

const main = async () => {
    try {
        await adjustStakingRates();
    } catch (err) {
        console.log(err);
    }
};

main();