import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import {address as treasuryAddress} from '../../deployments/mainnet/TheopetraTreasury.json'
const BigNumber = ethers.BigNumber;
dotenv.config();

const getForkedTheo = async () => {

    //Setup default user and impersonate calls
    let user = '0x06f3a31e675ddFEBafC87435686E63C156E2236C'

    if (ethers.utils.isAddress(process.argv.slice(2)[0])) {
        user = process.argv.slice(2)[0];
    } 

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasuryAddress],
      });

    await hre.network.provider.send("hardhat_setBalance", [
        treasuryAddress,
        "0x8ac7230489e80000",
    ]);

    await hre.network.provider.send("hardhat_setBalance", [
        user,
        "0x8ac7230489e80000",
    ]);
    
    const provider = new ethers.providers.JsonRpcProvider('https://e9ec-2600-1702-6d0-ba00-b113-f34b-8a32-38b2.ngrok.io');

    let signer = provider.getSigner(treasuryAddress);
    let contract = await ethers.getContractAt(abi, address, signer);

    await contract.mint(user, BigNumber.from('10000000000000000'));

    console.log(`Successfully minted $THEO to owner`);
    let newBalance = await contract.balanceOf(user);
    console.log(`$THEO Balance of address: ${user} is ${newBalance}`)
};

const main = async () => {
    try {
        await getForkedTheo();
    } catch (err) {
        console.log(err);
    }
};

main();