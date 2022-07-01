import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS, MOCKS } from '../utils/constants';

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
      const FounderVesting = await deployments.get(CONTRACTS.founderVesting);
      const performanceTokenAddress =
        chainId === '1337'
          ? (await deployments.get(MOCKS.usdcTokenMock))?.address
          : '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b'; // Rinkeby USDC token address

      const args = [TheopetraERC20Token.address, TheopetraAuthority.address, performanceTokenAddress, FounderVesting.address];

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
if (hre?.network?.config?.chainId === 1337) {
  func.dependencies = ['Mocks'];
}
