import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import { address as wethAddress, abi as wethAbi} from '../../deployments/staging/WethHelper.json';
dotenv.config();

const main = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const governorAddress = "0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A";

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governorAddress],
      });

    const signer = provider.getSigner(governorAddress);
      
    const wethHelper = new ethers.Contract(wethAddress, wethAbi, signer);

    await wethHelper.addDepo("0x9CC43eA3688a1D793155aA33DF1C42Af47C393Ed");
    await wethHelper.addDepo("0x4A351C6aE3249499CBb50E8FE6566E2615386Da8");

    console.log("Depo: ", await wethHelper.depoList(0));

};

const manageDepos = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

manageDepos();