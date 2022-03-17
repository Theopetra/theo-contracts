import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

    await deploy(CONTRACTS.theoToken, {
      from: deployer,
      log: true,
      args: [TheopetraAuthority.address],
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.theoToken];
func.dependencies = [CONTRACTS.authority];
