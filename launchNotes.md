# Launch Notes

- [ ] In Staking deploy script: `epochLength`, `firstEpochNumber` and `firstEpoch` to be updated as needed for other networks
- [ ] In Distributor deploy script: `epochLength` and `nextEpoch` to be updated as needed for other networks
- [ ] Testing very large deposits to the bond depo with e2e testing (with sTHEO supply increasing via rebasing)

## Contract Setup

### Constructor arguments

The constructor arguments used for each deployed contract can be found within the relevant deployment script, in the `/deploy` folder.
For example, the arguments for TheopetraStaking (see `/deploy/005_deploy_staking.ts`):

```
    args = [
      TheopetraERC20Token.address,
      sTheopetraERC20.address,
      epochLength,
      firstEpochNumber,
      firstEpochTime,
      stakingTerm,
      TheopetraAuthority.address,
      Treasury.address,
    ];
```

### Commonly used permissions, and initialization of staking tokens

Numerous methods within the contracts require certain permissions to be set, and for sTHEO and pTHEO to be initialized. This has already been carried out for the contracts that are deployed to Rinkeby. The snippet below shows a summary of the relevant methods used to set up permissions and initialize sTHEO and pTHEO (code taken from `deploy/setup/setupIntegration.ts`):

```
    /* ======== Setup for `Treasury.mint` (when `TheopetraBondDepository.deposit` is called) ======== */
    await waitFor(TheopetraAuthority.pushVault(Treasury.address, true)); // Push vault role to Treasury, to allow it to call THEO.mint
    await waitFor(sTheo.connect(owner).initialize(Staking.address, Treasury.address)); // Initialize sTHEO
    await waitFor(pTheo.connect(owner).initialize(StakingLocked.address)); // Initialize pTHEO

    /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
    await waitFor(Treasury.connect(owner).enable(8, Distributor.address, addressZero)); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)

    /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
    await waitFor(Treasury.connect(owner).enable(8, Distributor.address, addressZero)); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)

    /* ======== Other setup for `TheopetraBondDepository.deposit()` ======== */
    await waitFor(Treasury.connect(owner).enable(11, YieldReporter.address, addressZero)); // Enable Yield Reporter in Treasury
    await waitFor(Treasury.connect(owner).enable(8, BondDepository.address, addressZero)); // Set Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)

    /* ======== Setup to allow Pushing Claim during `TheopetraBondDepository.redeem()` and `WhitelistTheopetraBondDepository.redeem()` ======== */
    // Set addresses of bond depos in staking, to allow bond depos to push claims to user when they redeem a note
    await waitFor(Staking.setBondDepo(BondDepository.address, true));
    await waitFor(Staking.setBondDepo(WhitelistBondDepository.address, true));

    /* ======== Setup for Whitelist Bond Depository ======== */
    await waitFor(Treasury.connect(owner).enable(8, WhitelistBondDepository.address, addressZero)); // Set Whitelist Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)

    /* ======== Setup for Founder Vesting ======== */
    await waitFor(Treasury.connect(owner).enable(8, FounderVesting.address, addressZero)); // Set Whitelist Founder Vesting as reward manager in Treasury (to allow call to mint)

    /* ======== Distributor and Staking setup  ======== */
    // Set Distributor on Staking (unlocked) and StakingLocked contracts
    await waitFor(Staking.setContract(0, Distributor.address));
    await waitFor(StakingLocked.setContract(0, Distributor.address));
    // Set staking contracts on Distributor
    await waitFor(Distributor.setStaking(Staking.address));
    await waitFor(Distributor.setStaking(StakingLocked.address));
```

Further information on and demonstration of the above permissions being enabled can be found within the file `/scripts/referenceExamples/enablePermissions.ts`

### Minting THEO

For users to bond or stake, THEO must first be available (minted). An example of minting THEO (taken from `e2e.test.ts`) is shown below

```
    await TheopetraERC20Token.connect(treasurySigner).mint(WhitelistBondDepository.address, '10000000000000000'); // 1e16
```

`mint` can only be successfully called by the vault (owing to the function modifier `onlyVault`), which in the example above is `treasurySigner`

#### First call to `mint`, please note:

There is a cap on minting that limits the amount of newly minted THEO tokens.

The amount of new tokens minted is limited to at most 5% of the initial supply of tokens. Initial supply becomes non-zero only after minting occurs for the first time, and the value is stored in the state variable `_initialSupply`.
`_initialSupply` can only be set once.

For example, if -- when mint is called for the first time on the contract -- the mint `amount_` is 100, the cap on minting will then be set as 5. Any future calls to mint will mint at most 5 THEO tokens. e.g., a request to mint 50 tokens, `mint(<address>, 50)` will mint only 5 tokens.

Therefore care should be taken to ensure that the `amount_` used for the first call to `mint` is correct as desired/needed.

### WhitelistTheopetraBondDepository

#### Creating markets

Before a user can `deposit` in the WhitelistBondDepository, a market needs to be available to deposit into. Market creation is done using the method `create`. `create` has a function modifier that limits which account can call the function: `onlyPolicy`.

Below is an example of creating a market for the WhitelistBondDepository, taken from within `WhitelistBondDepository.test.ts`. In this test example, a mock has been used for the USDC token (and should therefore be replaced with the appropriate address of the actual USDC token, on whichever network is needed).
In addition, in the test-based example below, a mock (`AggregatorMockUSDC`) has been used in place of the Chainlink Aggregator. On the Rinkeby network, the actual aggregator contract (the code for which is found within this repo in `types/PriceConsumerV3.sol`) can be used. Please that this repo does not contain a deployment script for the PriceConsumer. Instead, for the time being, the contract has simply been deployed to Rinkeby via Remix, at the address `0x4a6057191E56647a10433A732611A4B45D9169D0`

```
    await WhitelistBondDepository.create(
      UsdcTokenMock.address,
      AggregatorMockUSDC.address,
      [capacity, fixedBondPrice],
      [capacityInQuote, fixedTerm],
      [vesting, usdcMarketconclusion]
    );
```

For more information about the method arguments used above, please see the test file `WhitelistBondDepository.test.ts`, as well as the comments within the `create` method in `WhitelistBondDepository.sol`. Furthermore, please also see comments within the `deposit` method, which also relate to arguments used during market creation; For example information on `market.capacity` within `deposit` is important to note, because the market capacity can prevent deposits depending on its value (setting `market.capacity` higher during market creation will allow for larger deposits).

#### Signing

Addresses for whitelisting should be hashed using SignerHelper -- A script can be used for this purpose, to itterate over addresses and, in a similar way to that shown below, to create hashes that can then be signed by the `whitelistSigner` as set within `TheopetraAuthority` (when initially deployed, the `whitelistSigner` is the governor):

```
async function setupForDeposit() {
    const [governorWallet] = await ethers.getSigners();
    const [, , bob] = users;

    // Deploy SignerHelper contract
    const signerHelperFactory = new SignerHelper__factory(governorWallet);
    const SignerHelper = await signerHelperFactory.deploy();
    // Create a hash in the same way as created by Signed contract
    const bobHash = await SignerHelper.createHash('', bob.address, WhitelistBondDepository.address, 'supersecret');

    // Set the secret on the Signed contract
    await WhitelistBondDepository.setSecret('supersecret');

    // 32 bytes of data in Uint8Array
    const messageHashBinary = ethers.utils.arrayify(bobHash);

    // To sign the 32 bytes of data, pass in the data
    signature = await governorWallet.signMessage(messageHashBinary);
    ...
}

```

Further examples of signature verification can be found within `WhitelistBondDepository.test.ts` in the describe block `'Deposit signature verification'`

### TheopetraBondDepository

#### Creating markets

Before a user can `deposit` in the TheopetraBondDepository, a market needs to be available to deposit into. Market creation is done using the method `create`. `create` has a function modifier that limits which account can call the function: `onlyPolicy`.

Below is an example of creating a market for the TheopetraBondDepository, taken from within `BondDepository.test.ts`. In this test example, a mock has been used for the USDC token (and should therefore be replaced with the appropriate address of the actual USDC token, on whichever network is needed).

```
    await BondDepository.create(
      UsdcTokenMock.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    );
```

For more information about the method arguments used above, please see the test file `BondDepository.test.ts`, as well as the comments within the `create` method in `BondDepository.sol`. Furthermore, please also see the use of variables within the `deposit` method; For example, `market.maxPayout` used within `deposit` is important to note, because this can prevent deposits depending on its value (setting `market.maxPayout` higher during market creation will allow for larger deposits) -- Examples of this, as well as the importance of other variables used during market creation can be found within the describe blocks `Deposit` and `Create market` in `BondDepository.test.ts`.

#### Performance update

For successful calls to `marketPrice` (during `deposit`), there needs to be some setup in the Treasury and YieldReporter, to get values for deltaTokenPrice and deltaTreasuryYield. A helper function showing an example of this is shown below (adapted from `test/utils/index.ts`), please see `BondDepository.test.ts` for more context on how this helper function is used:

```
export async function performanceUpdate<T>(
  Treasury: TheopetraTreasury,
  YieldReporter: TheopetraYieldReporter | YieldReporterMock,
  BondingCalculatorAddress: string
): Promise<void & T> {

  ...

  // Set the address of the bonding calculator
  await Treasury.setTheoBondingCalculator(BondingCalculatorAddress);

  // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state for token price
  // current token price will subsequently be updated, last token price will still be zero
  await moveTimeForward(60 * 60 * 8);
  await Treasury.tokenPerformanceUpdate();
  // Move forward in time again to update again, this time current token price becomes last token price
  await moveTimeForward(60 * 60 * 8);
  await Treasury.tokenPerformanceUpdate();

  ...

  // Report a couple of yields using the Yield Reporter (for use when calculating deltaTreasuryYield)
  // Difference in reported yields is chosen to be relatively low, to avoid hiting the maximum rate (cap) when calculating the nextRewardRate
  await waitFor(YieldReporter.reportYield(50_000_000_000));
  await waitFor(YieldReporter.reportYield(65_000_000_000));
}
```

#### Updating bonding rates

The Discount Rate Return Bond (Drb) and Discount Rate Return Yield (Dyb) are initially set during `create`, and can subsequently be updated via `setDiscountRateBond` and `setDiscountRateYield`

### StakingDistributor

#### addRecipient

A recipient(s) (Staking contract(s)) for distributions needs to be added in the StakingDistributor contract, before `distribute` can be successfully called.
See for example the following, taken from within the beforeEach block of `StakingDistributor.test.ts`:

```
await Distributor.addRecipient(Staking.address, expectedStartRateUnlocked, expectedDrs, expectedDys, isLocked);
```

For further context, see also the comments in `addRecipient` and `distribute`, in `StakingDistributor.sol`.

#### Reward rates

In order to calculate reward rates, the Treasury needs to be setup for calls to its methods `deltaTokenPrice` and `deltaTreasuryYield`. An example of such setup can be found elsewhere, in the section 'Performance update' above.
