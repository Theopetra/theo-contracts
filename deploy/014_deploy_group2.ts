import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log('Deployed Group 2: Bond Depository Contracts, Staking Contracts, and sTHEO ✅');

  const TheopetraAuthority = '0x9E62Cd7A3126f884304a88DE12071d17Cf8AD5Be';
  // Deploy sTHEO
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();


  // Deploy Whitelist Bond Depository

    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const sTheoToken = await deployments.get(CONTRACTS.sTheo);
    const Staking = await deployments.get(CONTRACTS.staking);
    const Treasury = await deployments.get(CONTRACTS.treasury);

  // Deploy Public Pre-List Bond Depository

  // Deploy Public Bond Depository


};

func.tags = ['grouptwo'];
func.dependencies = [];

export default func;
