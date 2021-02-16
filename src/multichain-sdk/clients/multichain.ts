import { TxHash, Network } from '@xchainjs/xchain-client'
import { decryptFromKeystore, Keystore } from '@xchainjs/xchain-crypto'
import {
  Chain,
  BTCChain,
  BNBChain,
  THORChain,
  ETHChain,
} from '@xchainjs/xchain-util'
import {
  MidgardV2,
  NetworkType as MidgardNetwork,
  PoolAddress,
} from 'midgard-sdk'

import { Swap, Memo, Asset, AssetAmount } from '../entities'
import { BnbChain } from './binance'
import { BtcChain } from './bitcoin'
import { EthChain } from './ethereum'
import { ThorChain } from './thorchain'
import {
  TxParams,
  AddLiquidityParams,
  WithdrawParams,
  Wallet,
  ChainWallet,
  supportedChains,
  SupportedChain,
} from './types'

// thorchain pool address is empty string
const THORCHAIN_POOL_ADDRESS = ''

export interface IMultiChain {
  chains: typeof supportedChains
  midgard: MidgardV2
  network: string

  wallets: Wallet | null

  thor: ThorChain
  btc: BtcChain
  bnb: BnbChain
  eth: EthChain

  getPhrase(): string
  setPhrase(phrase: string): void
  validateKeystore(keystore: Keystore, password: string): Promise<boolean>

  getMidgard(): MidgardV2
  getChainClient(chain: Chain): void
  getPoolAddressByChain(chain: Chain): Promise<PoolAddress>
  getWalletByChain(chain: Chain): Promise<ChainWallet>
  loadAllWallets(): Promise<Wallet | null>

  transfer(tx: TxParams): Promise<TxHash>
  swap(swap: Swap): Promise<TxHash>
  addLiquidity(params: AddLiquidityParams): Promise<TxHash>
  withdraw(params: WithdrawParams): Promise<TxHash>
}

export class MultiChain implements IMultiChain {
  private phrase: string

  private wallet: Wallet | null = null

  public readonly chains = supportedChains

  public readonly midgard: MidgardV2

  public readonly network: Network

  public thor: ThorChain

  public btc: BtcChain

  public bnb: BnbChain

  public eth: EthChain

  constructor({
    network = 'testnet',
    phrase = '',
  }: {
    network?: Network
    phrase?: string
  }) {
    this.network = network
    this.phrase = phrase

    // create midgard client
    this.midgard = new MidgardV2(MultiChain.getMidgardNetwork(network))

    // create chain clients
    this.thor = new ThorChain({ network, phrase })
    this.bnb = new BnbChain({ network, phrase })
    this.btc = new BtcChain({ network, phrase })
    this.eth = new EthChain({ network, phrase })
  }

  setPhrase = (phrase: string) => {
    this.phrase = phrase

    this.thor.getClient().setPhrase(phrase)
    this.bnb.getClient().setPhrase(phrase)
    this.btc.getClient().setPhrase(phrase)
    this.eth.getClient().setPhrase(phrase)

    this.initWallet()

    console.log('wallet:', this.wallet)
  }

  getPhrase = () => {
    return this.phrase
  }

  validateKeystore = async (keystore: Keystore, password: string) => {
    const phrase = await decryptFromKeystore(keystore, password)

    return phrase === this.phrase
  }

  initWallet = () => {
    this.wallet = {
      THOR: {
        address: this.thor.getClient().getAddress(),
        balance: [],
      },
      BNB: {
        address: this.bnb.getClient().getAddress(),
        balance: [],
      },
      BTC: {
        address: this.btc.getClient().getAddress(),
        balance: [],
      },
      ETH: {
        address: this.eth.getClient().getAddress(),
        balance: [],
      },
    }
  }

  /**
   * return midgard network type
   *
   * @param network mainnet or testnet
   */
  public static getMidgardNetwork(network: Network): MidgardNetwork {
    if (network === 'testnet') return 'testnet'
    return 'chaosnet'
  }

  get wallets(): Wallet | null {
    return this.wallet
  }

  /**
   * get midgard client
   */
  getMidgard(): MidgardV2 {
    return this.midgard
  }

  getPoolAddressByChain = async (chain: Chain): Promise<PoolAddress> => {
    try {
      // for thorchain, return empty string
      if (chain === THORChain) return THORCHAIN_POOL_ADDRESS

      const poolAddress = await this.midgard.getInboundAddressByChain(chain)

      return poolAddress
    } catch (error) {
      return Promise.reject(error)
    }
  }

  getChainClient = (chain: Chain) => {
    if (chain === THORChain) return this.thor
    if (chain === BNBChain) return this.bnb
    if (chain === BTCChain) return this.btc
    if (chain === ETHChain) return this.eth

    return null
  }

  getWalletByChain = async (chain: Chain): Promise<ChainWallet> => {
    const chainClient = this.getChainClient(chain)

    if (!chainClient) throw new Error('invalid chain')

    try {
      const balance = (await chainClient?.loadBalance()) ?? []
      const address = chainClient.getClient().getAddress()

      if (this.wallet && chain in this.wallet) {
        this.wallet = {
          ...this.wallet,
          [chain]: {
            address,
            balance,
          },
        }
      }

      return {
        address,
        balance,
      }
    } catch (error) {
      return Promise.reject(error)
    }
  }

  loadAllWallets = async (): Promise<Wallet | null> => {
    try {
      await Promise.all(
        this.chains.map((chain: SupportedChain) => {
          return new Promise((resolve) => {
            this.getWalletByChain(chain)
              .then((data) => resolve(data))
              .catch((err) => {
                console.log(err)
                resolve([])
              })
          })
        }),
      )

      return this.wallet
    } catch (error) {
      return Promise.reject(error)
    }
  }

  /**
   * transfer on binance chain
   * @param {TxParams} tx transfer parameter
   */
  transfer = async (tx: TxParams): Promise<TxHash> => {
    const { chain } = tx.assetAmount.asset

    // for swap, add, withdraw tx in thorchain, send deposit tx
    if (chain === THORChain && tx.recipient === THORCHAIN_POOL_ADDRESS) {
      return this.thor.deposit(tx)
    }

    const chainClient = this.getChainClient(chain)
    if (chainClient) {
      try {
        return await chainClient.transfer(tx)
      } catch (error) {
        return Promise.reject(error)
      }
    } else {
      throw new Error('Chain does not exist')
    }
  }

  /**
   * swap assets
   * @param {Swap} swap Swap Object
   */
  swap = async (swap: Swap): Promise<TxHash> => {
    /**
     * 1. check if swap has sufficient fee
     * 2. get pool address
     * 3. get swap memo
     * 4. transfer input asset to pool address
     */

    try {
      if (swap.hasInSufficientFee) {
        return await Promise.reject(new Error('Insufficient Fee'))
      }

      const poolAddress = await this.getPoolAddressByChain(
        swap.inputAsset.chain,
      )
      const memo = Memo.swapMemo(swap.outputAsset, poolAddress, swap.slipLimit)

      return await this.transfer({
        assetAmount: swap.inputAmount,
        recipient: poolAddress,
        memo,
      })
    } catch (error) {
      return Promise.reject(error)
    }
  }

  /**
   * add liquidity to pool
   * @param {AddLiquidityParams} params
   */
  addLiquidity = async (params: AddLiquidityParams): Promise<TxHash> => {
    /**
     * 1. get pool address
     * 2. get add liquidity memo
     * 3. check add type (Sym or Asym add)
     * 4. add liquidity to pool
     */

    try {
      const { pool, runeAmount, assetAmount } = params
      const { chain } = pool.asset

      const poolAddress = await this.getPoolAddressByChain(chain)

      // sym stake
      if (runeAmount && runeAmount.gt(runeAmount._0_AMOUNT)) {
        if (assetAmount.lte(assetAmount._0_AMOUNT)) {
          return await Promise.reject(new Error('Invalid Asset Amount'))
        }

        // 1. send rune (NOTE: recipient should be empty string)
        await this.transfer({
          assetAmount: runeAmount,
          recipient: THORCHAIN_POOL_ADDRESS,
          memo: Memo.depositMemo(Asset.RUNE()),
        })

        // 2. send asset
        return await this.transfer({
          assetAmount,
          recipient: poolAddress,
          memo: Memo.depositMemo(pool.asset),
        })
      }
      // asym stake
      if (assetAmount.lte(assetAmount._0_AMOUNT)) {
        return await Promise.reject(new Error('Invalid Asset Amount'))
      }

      return await this.transfer({
        assetAmount,
        recipient: poolAddress,
        memo: Memo.depositMemo(pool.asset),
      })
    } catch (error) {
      return Promise.reject(error)
    }
  }

  /**
   * withdraw asset from pool
   * @param {WithdrawParams} params
   */
  withdraw = async (params: WithdrawParams): Promise<TxHash> => {
    /**
     * 1. get pool address
     * 2. get withdraw memo
     * 3. transfer withdraw tx
     */

    try {
      const { pool, percent } = params
      const memo = Memo.withdrawMemo(pool.asset, percent)
      const { chain } = pool.asset

      const poolAddress = await this.getPoolAddressByChain(chain)

      const txHash = await this.transfer({
        assetAmount: AssetAmount.getMinAmountByChain(chain),
        recipient: poolAddress,
        memo,
      })

      return txHash
    } catch (error) {
      return Promise.reject(error)
    }
  }
}
