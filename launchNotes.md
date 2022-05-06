# Launch Notes

- [ ] In Staking deploy script: `epochLength`, `firstEpochNumber` and `firstEpoch` to be updated as needed for other networks
- [ ] In Distributor deploy script: `epochLength` and `nextEpoch` to be updated as needed for other networks
- [ ] Testing very large deposits to the bond depo with e2e testing (with sTHEO supply increasing via rebasing)



## Contract Setup

### Commonly used permissions, and initialization of staking tokens
Numerous methods within the contracts require certain permissions to be set, and for sTHEO and pTHEO to be initialized. This has already been carried out for the contracts that are deployed to Rinkeby. The snippet below shows a summary of the relevant methods used to set up permissions and initialize sTHEO and pTHEO (code taken from `deploy/setup/setupIntegration.ts` within the branch `sn/rinkeby-testnet-deploy-new-testing`, which was also used to deploy the contracts to the Rinkeby network):

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

Further information on and demonstration of the above permissions being enabled can be found in the branch `sn/rinkeby-testnet-enable-basic-permissions` within the file `scripts/enablePermissions.ts`


### Minting THEO
For users to bond or stake, THEO must first be available (minted). An example of minting THEO (taken from `e2e.test.ts`) is shown below
```
    await TheopetraERC20Token.connect(treasurySigner).mint(WhitelistBondDepository.address, '10000000000000000'); // 1e16
```
`mint` can only be successfully called by the vault (`onlyVault`), which in the example above is `treasurySigner`

#### First call to `mint`, please note:

There is a cap on minting that limits the amount of newly minted THEO tokens.

The amount of new tokens minted is limited to at most 5% of the initial supply of tokens. Initial supply becomes non-zero only after minting occurs for the first time, and the value is stored in the state variable `_initialSupply`.
`_initialSupply` can only be set once.

For example, if -- when mint is called for the first time on the contract -- the mint `amount_` is 100, the cap on minting will then be set as 5. Any future calls to mint will mint at most 5 THEO tokens. e.g., a request to mint 50 tokens, `mint(<address>, 50)` will mint only 5 tokens.

 Therefore care should be taken to ensure that the `amount_` used for the first call to `mint` is correct as desired/needed.

