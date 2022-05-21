import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MOCKSWITHARGS, CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getNamedAccounts, getChainId } = hre;
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer } = await getNamedAccounts();
    const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984'; // UniswapV3Factory address


    // On Hardhat or Rinkeby network
    if (chainId === '1337' || chainId === '4') {
      const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
      const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

      const args = [TheopetraERC20Token.address, TheopetraAuthority.address];

      await deploy('NewBondingCalculatorMock', {
        from: deployer,
        log: true,
        args,
      });
    }
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = ['NewBondingCalculatorMock'];
if (hre?.network?.config?.chainId === 1337 || hre?.network?.config?.chainId === 4) {
  func.dependencies = ['MockOracleLibrary'];
}
