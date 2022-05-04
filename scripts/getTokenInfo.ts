import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import {TheopetraERC20Token__factory} from "../typechain-types";
dotenv.config();

const tokenNameAndSymbol = async () => {
  // Connect to Ethereum test network (rinkeby, using Alchemy as a backer below)
  // Default provider (via `getDefaultProvider`) is provided by ethers but highly throttled
  // const provider = hre.ethers.getDefaultProvider('rinkeby');
  // E.g. with Metamask would be like:
  // const provider = new ethers.providers.Web3Provider(window.ethereum)
  // Using Alchemy below
  const provider = new ethers.providers.AlchemyProvider("rinkeby", process.env.ALCHEMY_API_KEY)
  // Call existing contract using contract's factory from typechain-types
  // Address can be found in deployments/rinkeby folder
  const TheopetraERC20Token = TheopetraERC20Token__factory.connect("0x1A2EA28399A2e4f8f3EEfeA5f41770B4C61fE643", provider);
  // Call the methods `name` and `symbol` on the contract
  const contractName = await TheopetraERC20Token.name();
  const contractSymbol = await TheopetraERC20Token.symbol();
  console.log("Provider Network:", provider.network);
  console.log("Name >>>>> ", contractName);
  console.log("Symbol >>>>> ", contractSymbol);

  // Get balance for a user
  // First, get unnamed addresses
  const [, bobAddress] = await getUnnamedAccounts();
  console.log("Address For bob >>>>", bobAddress);
  const bobBalance = await TheopetraERC20Token.balanceOf(bobAddress);
  // Balance will be as a BigNumber
  console.log("Bob THEO balance >>>>", bobBalance);
  // Convert BigNumber to integer
  console.log("Bob balance as Int", bobBalance.toNumber());

  // How to connect the user to a contract
  // Get the signer for the first unnamedAccount, for use with signing messages and transactions,
  // and sending signed transactions to the network to execute state change operations
  TheopetraERC20Token.connect(await ethers.getSigner(bobAddress));
};

const getTokenInfo = async () => {
  try {
      await tokenNameAndSymbol();
  } catch (err) {
      console.log(err);
  }
};

getTokenInfo();
