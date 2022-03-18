import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const sTheoToken = await deployments.get(CONTRACTS.sTheo);
    const Staking = await deployments.get(CONTRACTS.staking);
    const Treasury = await deployments.get(CONTRACTS.treasury);
    const PriceConsumerV3 = await deployments.get(CONTRACTS.priceConsumerV3);

    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();
    const args = [
      TheopetraAuthority.address,
      TheopetraERC20Token.address,
      sTheoToken.address,
      Staking.address,
      Treasury.address,
      PriceConsumerV3.address,
    ];

    // If on Hardhat network, update args with addresses of already-deployed mocks
    if (chainId === '1337') {
      const { TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock, PriceConsumerV3Mock } =
        await getNamedMockAddresses(hre);
      args.splice(1, 5, TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock, PriceConsumerV3Mock);
    }

    await deploy(CONTRACTS.whitelistBondDepo, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.whitelistBondDepo];
func.dependencies =
  hre?.network?.config?.chainId === 1337
    ? [CONTRACTS.authority, 'Mocks']
    : [
        CONTRACTS.authority,
        CONTRACTS.theoToken,
        CONTRACTS.sTheo,
        CONTRACTS.staking,
        CONTRACTS.treasury,
        CONTRACTS.priceConsumerV3
      ];
