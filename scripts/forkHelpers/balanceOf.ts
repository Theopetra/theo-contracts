import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { address, abi } from '../../deployments/mainnet/TheopetraERC20Token.json';
import { address as WETH9_ADDRESS, abi as WETH9_ABI} from '../phase2/WETH9.json';

dotenv.config();

const main = async () => {

    let user = '0x06f3a31e675ddFEBafC87435686E63C156E2236C'
    
    if (ethers.utils.isAddress(process.argv.slice(2)[0])) {
        user = process.argv.slice(2)[0];
    }

    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');
    const signer = provider.getSigner();
      
    const TheopetraERC20Token = new ethers.Contract(address, abi, signer);
    const WETH9Token = new ethers.Contract(WETH9_ADDRESS, WETH9_ABI, signer);

    const THEOBalance = await TheopetraERC20Token.balanceOf(user);
    
    const WETHBalance = await WETH9Token.balanceOf(user);

    console.log(`$THEO balance: ${THEOBalance}, $WETH Balance: ${WETHBalance}`);

};

const createNewMarket = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

createNewMarket();