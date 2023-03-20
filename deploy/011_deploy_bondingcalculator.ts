import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getNamedAccounts, getChainId } = hre;
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer } = await getNamedAccounts();
    // const founderVesting = await deployments.get(CONTRACTS.founderVesting);
    const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984'; // UniswapV3Factory address
    let theoAddress;
    let performanceTokenAddress;
    let founderVesting18;
    let founderVesting36;
    let secondsAgo;
    let fee;


    // On Hardhat or Rinkeby network
    if (chainId === '1337' || chainId === '4') {
      theoAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b'; // Using Rinkeby USDC token address in place of THEO (as no THEO/PerformancToken pair exists yet)
      performanceTokenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab'; // Using Rinkeby WETH token address
      secondsAgo = 60;
      fee = 3000; // 0.3%. The enabled fee for the pool, denominated in hundredths of a bip (i.e. 1e-6).
    } else if (chainId === '1' || chainId === '31337') {
      theoAddress = '0xfAc0403a24229d7e2Edd994D50F5940624CBeac2';
      performanceTokenAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
      founderVesting18 = '0xE3Ff6b10715a472045d7C504d63D8397e314A5eA';
      founderVesting36 = '0x99Fc868934dA64dfB418B0860327150823C2C802';
      secondsAgo = 1800;
      fee = 10000;
    }

    const args = [factoryAddress, theoAddress, performanceTokenAddress, [founderVesting18, founderVesting36], fee, secondsAgo];

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
