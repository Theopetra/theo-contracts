import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getNamedAccounts, getChainId } = hre;
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer } = await getNamedAccounts();
    const founderVesting = await deployments.get(CONTRACTS.founderVesting);
    const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984'; // UniswapV3Factory address
    let theoAddress;
    let performanceTokenAddress;
    let secondsAgo;
    let fee;


    // On Hardhat or Rinkeby network
    if (chainId === '1337' || chainId === '4') {
      theoAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b'; // Using Rinkeby USDC token address in place of THEO (as no THEO/PerformancToken pair exists yet)
      performanceTokenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab'; // Using Rinkeby WETH token address
      secondsAgo = 60;
      fee = 3000; // 0.3%. The enabled fee for the pool, denominated in hundredths of a bip (i.e. 1e-6).
    } else if (chainId === '1') {
      // TODO: Add arguments for use on mainnet
    }

    const args = [factoryAddress, theoAddress, performanceTokenAddress, founderVesting.address, fee, secondsAgo];

    await deploy(CONTRACTS.twapGetter, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.twapGetter];
