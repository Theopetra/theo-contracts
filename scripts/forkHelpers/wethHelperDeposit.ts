import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import {BigNumber} from "ethers";
import { address, abi } from '../../deployments/staging/WethHelper.json';
import { address as wethAddress, abi as wethAbi} from '../phase2/WETH9.json';
dotenv.config();

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    // const governorAddress = "0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A";
    const governorAddress = "0xad72ded03a5110c1807e68022d25c75e79b50ec5"

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governorAddress],
    });

    await hre.network.provider.send("hardhat_setBalance", [
        governorAddress,
        "0x3635C9ADC5DEA00000",
    ]);

    const signer = provider.getSigner(governorAddress);
    const wallet = new ethers.Wallet(process.env.MAINNET_PRIVATE_KEY ? process.env.MAINNET_PRIVATE_KEY : "No private key given", provider);
    const tx = await wallet.signTransaction({
        to: address,
        value: ethers.utils.parseEther("0.2"),
        nonce: 5,
        gasPrice: 21000,
        gasLimit: 30000000,
        data: "0x4a701cf4000000000000000000000000000000000000000000000000000000000000001e00000000000000000000000000000000000000000000000002cda5ee04a10000000000000000000000000000ad72ded03a5110c1807e68022d25c75e79b50ec5000000000000000000000000ad72ded03a5110c1807e68022d25c75e79b50ec50000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000"
    });
      
    const wethHelper = new ethers.Contract(address, abi, signer);
    const WETH9 = new ethers.Contract(wethAddress, wethAbi, signer);

    let token = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

    try {
        await provider.sendTransaction(tx);
        // await wethHelper.deposit(30, "0x166d2f702508000", governorAddress, governorAddress, 3, false, "0x00", {value: "100000000000000000"});
        console.log("Deposited");

    } catch (e) {
        console.log(e);
    }

    // console.log(`Treasury balance is ${treasuryWeth}, Governor wallet balance is ${govWeth}`);

};

const depositWeth = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

depositWeth();