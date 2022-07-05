import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log('Deployed Group 1: THEO token, Treasury, Authority, Yield Reporter, and Founder Vesting. ✅');
};

func.tags = ['groupone'];
func.dependencies = [CONTRACTS.authority, CONTRACTS.theoToken, CONTRACTS.treasury, CONTRACTS.yieldReporter, CONTRACTS.founderVesting];

export default func;
