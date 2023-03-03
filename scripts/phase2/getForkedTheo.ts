import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import {address as treasuryAddress} from '../../deployments/mainnet/TheopetraTreasury.json'
dotenv.config();

const doTheTest = async () => {

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasuryAddress],
      });

    await hre.network.provider.send("hardhat_setBalance", [
        treasuryAddress,
        "0x8ac7230489e80000",
    ]);
    
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    let signer = provider.getSigner(treasuryAddress);
    let contract = await ethers.getContractAt(abi, address, signer);

    await contract.mint('0xAd72dEd03A5110c1807E68022D25c75E79B50eC5', 1000000000000000);

    console.log(`Successfully minted $THEO to owner`);
    let newBalance = await contract.balanceOf('0xAd72dEd03A5110c1807E68022D25c75E79B50eC5');
    console.log(`$THEO Balance of address: 0xAd72dEd03A5110c1807E68022D25c75E79B50eC5 is ${newBalance}`)
};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();