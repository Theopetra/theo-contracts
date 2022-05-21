import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getNamedAccounts, getChainId } = hre;
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer } = await getNamedAccounts();


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
