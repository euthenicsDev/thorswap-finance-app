import { createAsyncThunk } from '@reduxjs/toolkit'
import { ActionTypeEnum } from 'midgard-sdk'

import { midgardApi } from 'services/midgard'
import { getThorchainMimir } from 'services/thornode'

import { TxTracker } from './types'

export const getPools = createAsyncThunk(
  'midgard/getPools',
  midgardApi.getPools,
)

export const getPoolStats = createAsyncThunk(
  'midgard/getPoolStats',
  midgardApi.getPoolStats,
)

export const getNetworkData = createAsyncThunk(
  'midgard/getNetworkData',
  midgardApi.getNetworkData,
)

export const getStats = createAsyncThunk(
  'midgard/getStats',
  midgardApi.getStats,
)

export const getConstants = createAsyncThunk(
  'midgard/getConstants',
  midgardApi.getConstants,
)

export const getQueue = createAsyncThunk(
  'midgard/getQueue',
  midgardApi.getQueue,
)

export const getLastblock = createAsyncThunk(
  'midgard/getLastblock',
  midgardApi.getLastblock,
)

export const getActions = createAsyncThunk(
  'midgard/getActions',
  midgardApi.getActions,
)

export const getSwapHistory = createAsyncThunk(
  'midgard/getSwapHistory',
  midgardApi.getSwapHistory,
)

export const getLiquidityHistory = createAsyncThunk(
  'midgard/getLiquidityHistory',
  midgardApi.getLiquidityHistory,
)

export const getEarningsHistory = createAsyncThunk(
  'midgard/getEarningsHistory',
  midgardApi.getEarningsHistory,
)

export const getDepthHistory = createAsyncThunk(
  'midgard/getDepthHistory',
  midgardApi.getDepthHistory,
)

export const getMemberDetail = createAsyncThunk(
  'midgard/getMemberDetail',
  midgardApi.getMemberDetail,
)

export const pollUpgradeTx = createAsyncThunk(
  'midgard/pollUpgradeTx',
  async (txTracker: TxTracker) => {
    const {
      submitTx: { recipient },
    } = txTracker

    if (recipient) {
      const response = await midgardApi.getActions({
        limit: 1,
        offset: 0,
        address: recipient,
        type: ActionTypeEnum.Switch,
      })
      return response
    }

    throw Error('no recipient')
  },
)

export const pollTx = createAsyncThunk(
  'midgard/pollTx',
  async (txTracker: TxTracker) => {
    let txId = txTracker.submitTx?.txID

    if (txId && txId.includes('0x')) {
      txId = txId.slice(2)
    }

    const response = await midgardApi.getActions({
      limit: 1,
      offset: 0,
      txId,
    })
    return response
  },
)

export const getMimir = createAsyncThunk(
  'thorchain/getThorchainMimir',
  async () => {
    const { data } = await getThorchainMimir()

    return data
  },
)
