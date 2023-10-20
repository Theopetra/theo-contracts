import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import {address as treasuryAddress} from '../../deployments/mainnet/TheopetraTreasury.json'
const BigNumber = ethers.BigNumber;
dotenv.config();

const getForkedTheo = async () => {

    // Setup default user and impersonate calls
    // let user = '0x06f3a31e675ddFEBafC87435686E63C156E2236C'
    
    // if (ethers.utils.isAddress(process.argv.slice(2)[0])) {
    //     user = process.argv.slice(2)[0];
    // }

    const users = [
        "0x06f3a31e675ddFEBafC87435686E63C156E2236C",
        "0x2a000fc65c2563A48ff155632C6A8261D8f73092",
        "0x474627714EC7cE9CF185c2a42d15D99c218555f1",
        "0xEd75Eb99ffD5f1ca9Ada7315c4fDE8622504C7c9",
        "0xAd72dEd03A5110c1807E68022D25c75E79B50eC5",
        "0x2C9a73387726496623428e91EC4F3be5BE3F0001",
        "0x66d8519A8070e76f3D33BdF4f36C9DbcF3bF4723",
        "0x023893b26DEe6A41233787Bf8F0a36e92A41980C",
        "0x4a353506c67E8742B2474FEBCAF698A8b0778b7D",
        "0xCB45e7b6320331D70c29F77d6Cf735de59d210DA",
        "0x9E18357549D4727d5bE5ac2De9C84c9E75d03C00"
    ]

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');

    const signer = provider.getSigner(treasuryAddress);
    const contract = await ethers.getContractAt(abi, address, signer);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasuryAddress],
    });

    await hre.network.provider.send("hardhat_setBalance", [
        treasuryAddress,
        "0x3635C9ADC5DEA00000",
    ]);

    // await hre.network.provider.send("hardhat_setBalance", [
    //     user,
    //     "0x3635C9ADC5DEA00000",
    // ]);

    for (const user of users) {
        await hre.network.provider.send("hardhat_setBalance", [
            user,
            "0x3635C9ADC5DEA00000",
        ]);

        await contract.mint(user, BigNumber.from('10000000000000000'));
    }


    console.log(`Successfully minted $THEO to owner`);
    // const newBalance = await contract.balanceOf(user);
    // console.log(`$THEO Balance of address: ${user} is ${newBalance}`)
};

const main = async () => {
    try {
        await getForkedTheo();
    } catch (err) {
        console.log(err);
    }
};

main();