import hre from 'hardhat';

const rinkebyInfo = async () => {
  const accounts = await hre.ethers.getSigners();
  // Default provider (via `getDefaultProvider`) is provided by ethers but highly throttled
  const provider = await hre.ethers.getDefaultProvider('rinkeby');
  console.log(provider.network, accounts);
};

const getRinkebyInfo = async () => {
  try {
      await rinkebyInfo();
  } catch (err) {
      console.log(err);
  }
};

getRinkebyInfo();
