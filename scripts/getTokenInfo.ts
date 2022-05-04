import hre from 'hardhat';
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import {TheopetraERC20Token__factory} from "../typechain-types";
dotenv.config();

const tokenNameAndSymbol = async () => {
  // Connect to Ethereum test network (rinkeby, backed by third party provider Alchemy/Infura)
  // Default provider (via `getDefaultProvider`) is provided by ethers but highly throttled
  // const provider = hre.ethers.getDefaultProvider('rinkeby');
  const provider = new ethers.providers.AlchemyProvider("rinkeby", process.env.ALCHEMY_API_KEY)
  // Call existing contract using contract's factory from typechain-types
  const TheopetraERC20Token = TheopetraERC20Token__factory.connect("0x1A2EA28399A2e4f8f3EEfeA5f41770B4C61fE643", provider);
  // Call the methods `name` and `symbol` on the contract
  const contractName = await TheopetraERC20Token.name();
  const contractSymbol = await TheopetraERC20Token.symbol();
  console.log("Provider Network:", provider.network);
  console.log("Name >>>>> ", contractName);
  console.log("Symbol >>>>> ", contractSymbol);
};

const getTokenInfo = async () => {
  try {
      await tokenNameAndSymbol();
  } catch (err) {
      console.log(err);
  }
};

getTokenInfo();
