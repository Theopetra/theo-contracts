import {Interface} from "@ethersproject/abi";
import INonfungiblePositionManager from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'
import { BigintIsh } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

/**
 * Generated method parameters for executing a call.
 */
export interface MethodParameters {
    /**
     * The hex encoded calldata to perform the given operation
     */
    calldata: string
    /**
     * The amount of ether (wei) to send in hex.
     */
    value: string
}

/**
 * Converts a big int to a hex string
 * @param bigintIsh
 * @returns The hex encoded calldata
 */
export function toHex(bigintIsh: BigintIsh) {
    const bigInt = JSBI.BigInt(bigintIsh)
    let hex = bigInt.toString(16)
    if (hex.length % 2 !== 0) {
        hex = `0${hex}`
    }
    return `0x${hex}`
}
export abstract class Multicall {
    public static INTERFACE: Interface = new Interface(IMulticall.abi)

    /**
     * Cannot be constructed.
     */
    private constructor() {}

    public static encodeMulticall(calldatas: string | string[]): string {
        if (!Array.isArray(calldatas)) {
            calldatas = [calldatas]
        }

        return calldatas.length === 1 ? calldatas[0] : Multicall.INTERFACE.encodeFunctionData('multicall', [calldatas])
    }
}

export abstract class NonfungiblePositionManager {
    public static INTERFACE: Interface = new Interface(INonfungiblePositionManager.abi)

    /**
     * Cannot be constructed.
     */
    private constructor() {}

    private static encodeCreate(pool: Pool): string {
        return NonfungiblePositionManager.INTERFACE.encodeFunctionData('createAndInitializePoolIfNecessary', [
            pool.token0.address,
            pool.token1.address,
            pool.fee,
            toHex(pool.sqrtRatioX96)
        ])
    }

    public static createCallParameters(pool: Pool): MethodParameters {
        return {
            calldata: this.encodeCreate(pool),
            value: toHex(0)
        }
    }

    public static addCallParameters(position: Position, options: AddLiquidityOptions): MethodParameters {
        invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY')

        const calldatas: string[] = []

        // get amounts
        const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts

        // adjust for slippage
        const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance)
        const amount0Min = toHex(minimumAmounts.amount0)
        const amount1Min = toHex(minimumAmounts.amount1)

        const deadline = toHex(options.deadline)

        // create pool if needed
        if (isMint(options) && options.createPool) {
            calldatas.push(this.encodeCreate(position.pool))
        }

        // permits if necessary
        if (options.token0Permit) {
            calldatas.push(SelfPermit.encodePermit(position.pool.token0, options.token0Permit))
        }
        if (options.token1Permit) {
            calldatas.push(SelfPermit.encodePermit(position.pool.token1, options.token1Permit))
        }

        // mint
        if (isMint(options)) {
            const recipient: string = validateAndParseAddress(options.recipient)

            calldatas.push(
                NonfungiblePositionManager.INTERFACE.encodeFunctionData('mint', [
                    {
                        token0: position.pool.token0.address,
                        token1: position.pool.token1.address,
                        fee: position.pool.fee,
                        tickLower: position.tickLower,
                        tickUpper: position.tickUpper,
                        amount0Desired: toHex(amount0Desired),
                        amount1Desired: toHex(amount1Desired),
                        amount0Min,
                        amount1Min,
                        recipient,
                        deadline
                    }
                ])
            )
        } else {
            // increase
            calldatas.push(
                NonfungiblePositionManager.INTERFACE.encodeFunctionData('increaseLiquidity', [
                    {
                        tokenId: toHex(options.tokenId),
                        amount0Desired: toHex(amount0Desired),
                        amount1Desired: toHex(amount1Desired),
                        amount0Min,
                        amount1Min,
                        deadline
                    }
                ])
            )
        }

        let value: string = toHex(0)

        if (options.useNative) {
            const wrapped = options.useNative.wrapped
            invariant(position.pool.token0.equals(wrapped) || position.pool.token1.equals(wrapped), 'NO_WETH')

            const wrappedValue = position.pool.token0.equals(wrapped) ? amount0Desired : amount1Desired

            // we only need to refund if we're actually sending ETH
            if (JSBI.greaterThan(wrappedValue, ZERO)) {
                calldatas.push(Payments.encodeRefundETH())
            }

            value = toHex(wrappedValue)
        }

        return {
            calldata: Multicall.encodeMulticall(calldatas),
            value
        }
    }

    private static encodeCollect(options: CollectOptions): string[] {
        const calldatas: string[] = []

        const tokenId = toHex(options.tokenId)

        const involvesETH =
            options.expectedCurrencyOwed0.currency.isNative || options.expectedCurrencyOwed1.currency.isNative

        const recipient = validateAndParseAddress(options.recipient)

        // collect
        calldatas.push(
            NonfungiblePositionManager.INTERFACE.encodeFunctionData('collect', [
                {
                    tokenId,
                    recipient: involvesETH ? ADDRESS_ZERO : recipient,
                    amount0Max: MaxUint128,
                    amount1Max: MaxUint128
                }
            ])
        )

        if (involvesETH) {
            const ethAmount = options.expectedCurrencyOwed0.currency.isNative
                ? options.expectedCurrencyOwed0.quotient
                : options.expectedCurrencyOwed1.quotient
            const token = options.expectedCurrencyOwed0.currency.isNative
                ? (options.expectedCurrencyOwed1.currency as Token)
                : (options.expectedCurrencyOwed0.currency as Token)
            const tokenAmount = options.expectedCurrencyOwed0.currency.isNative
                ? options.expectedCurrencyOwed1.quotient
                : options.expectedCurrencyOwed0.quotient

            calldatas.push(Payments.encodeUnwrapWETH9(ethAmount, recipient))
            calldatas.push(Payments.encodeSweepToken(token, tokenAmount, recipient))
        }

        return calldatas
    }

    public static collectCallParameters(options: CollectOptions): MethodParameters {
        const calldatas: string[] = NonfungiblePositionManager.encodeCollect(options)

        return {
            calldata: Multicall.encodeMulticall(calldatas),
            value: toHex(0)
        }
    }

    /**
     * Produces the calldata for completely or partially exiting a position
     * @param position The position to exit
     * @param options Additional information necessary for generating the calldata
     * @returns The call parameters
     */
    public static removeCallParameters(position: Position, options: RemoveLiquidityOptions): MethodParameters {
    }

    public static safeTransferFromParameters(options: SafeTransferOptions): MethodParameters {
        const recipient = validateAndParseAddress(options.recipient)
        const sender = validateAndParseAddress(options.sender)

        let calldata: string
        if (options.data) {
            calldata = NonfungiblePositionManager.INTERFACE.encodeFunctionData(
                'safeTransferFrom(address,address,uint256,bytes)',
                [sender, recipient, toHex(options.tokenId), options.data]
            )
        } else {
            calldata = NonfungiblePositionManager.INTERFACE.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
                sender,
                recipient,
                toHex(options.tokenId)
            ])
        }
        return {
            calldata: calldata,
            value: toHex(0)
        }
    }
}
