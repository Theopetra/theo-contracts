import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import abi from './FiatTokenProxy.json';
const BigNumber = ethers.BigNumber;
dotenv.config();

const getForkedUSDC = async () => {

    const address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const treasuryAddress = "0x5b6122c109b78c6755486966148c1d70a50a47d7";

    //Setup default user and impersonate calls
    // let user = '0x06f3a31e675ddFEBafC87435686E63C156E2236C'
    //
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
        "0x4a353506c67E8742B2474FEBCAF698A8b0778b7D"
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
        "0x8ac7230489e80000",
    ]);

    for (const user of users) {
        await hre.network.provider.send("hardhat_setBalance", [
            user,
            "0x8ac7230489e80000",
        ]);

        await contract.mint(user, BigNumber.from('100000000000'));
    }


    console.log(`Successfully minted $USDC to owner`);
    // const newBalance = await contract.balanceOf(user);
    // console.log(`$THEO Balance of address: ${user} is ${newBalance}`)
};

const main = async () => {
    try {
        await getForkedUSDC();
    } catch (err) {
        console.log(err);
    }
};

main();