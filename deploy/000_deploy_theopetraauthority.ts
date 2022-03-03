import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(CONTRACTS.authority, {
    from: deployer,
    args: [deployer, deployer, deployer, deployer, deployer],
    log: true,
  });
};

func.tags = [CONTRACTS.authority];

export default func;
