import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy(CONTRACTS.priceConsumerV3, {
      from: deployer,
      log: true,
    });
  } catch (error) {
    console.log(error);
  }
};

func.tags = [CONTRACTS.priceConsumerV3];

export default func;
