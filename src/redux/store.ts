import {
  createStore as reduxCreateStore,
  applyMiddleware,
  Store,
  CombinedState
} from 'redux'
import logger from 'redux-logger'
import rootReducer from './reducer'

import { persistStore, persistReducer, PersistedState } from 'redux-persist'
import storage from 'redux-persist/lib/storage' // defaults to localStorage for web
import { Information, Asset } from 'ustaxes/core/data'
import { blankYearTaxesState, YearsTaxesState } from '.'
import { Actions } from './actions'
import { PersistPartial } from 'redux-persist/es/persistReducer'
import { createTransform } from 'redux-persist'
import { FSAction } from './fs/Actions'
import fsReducer from './fs/FSReducer'
import { migrateEachYear } from './migration'
import { TaxYear } from 'ustaxes/data'
import _ from 'lodash'

type SerializedState = { [K in TaxYear]: Information } & {
  assets: Asset<string>[]
  activeYear: TaxYear
}

export type USTSerializedState = NonNullable<PersistedState> & SerializedState
export type USTState = NonNullable<PersistedState> & YearsTaxesState

const positionTransformDS = (p: Asset): Asset<string> => ({
  ...p,
  openDate: p.openDate.toISOString(),
  closeDate: p.closeDate?.toISOString(),
  giftedDate: p.giftedDate?.toISOString()
})

const positionTransformSD = (p: Asset<string>): Asset => ({
  ...p,
  openDate: new Date(p.openDate),
  closeDate: p.closeDate ? new Date(p.closeDate) : undefined,
  giftedDate: p.giftedDate ? new Date(p.giftedDate) : undefined
})

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/**
 * Redux-persist calls the transform function not for
 * the entire state, but for each reducer in our state.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export const serializeTransform = (s: any): any => {
  // We're only looking for the assets array.
  // Assuming for now that the only array as a value in the
  // root of the state is the assets array.
  if (!_.isArray(s)) {
    return s
  }
  return (s as Asset[]).map((p) => positionTransformDS(p))
}

export const deserializeTransform = (s: any): any => {
  // We're only looking for the assets array.
  // Assuming for now that the only array as a value in the
  // root of the state is the assets array.
  if (!_.isArray(s)) {
    return s
  }
  return (s as Asset<string>[]).map((p) => positionTransformSD(p))
}
/* eslint-enable @typescript-eslint/no-explicit-any */
/* eslint-enable @typescript-eslint/explicit-module-boundary-types */

const dateStringTransform = createTransform(
  serializeTransform,
  deserializeTransform
)

const migrate = async (state: USTState): Promise<USTState> =>
  migrateEachYear(state)

const persistedReducer = fsReducer(
  'ustaxes_save.json',
  persistReducer<CombinedState<YearsTaxesState>, Actions>(
    {
      key: 'root',
      storage,
      migrate: async (state) =>
        state === undefined
          ? undefined
          : await migrate({ ...blankYearTaxesState, ...state }),
      transforms: [dateStringTransform]
    },
    rootReducer
  )
)

export type InfoStore = Store<YearsTaxesState, FSAction & Actions> & {
  dispatch: unknown
}

export type PersistedStore = Store<
  YearsTaxesState & PersistPartial,
  FSAction & Actions
> & {
  dispatch: unknown
}

export const createWholeStoreUnpersisted = (
  state: YearsTaxesState
): InfoStore => reduxCreateStore(rootReducer, state, undefined)

export const createStoreUnpersisted = (information: Information): InfoStore =>
  createWholeStoreUnpersisted({
    ...blankYearTaxesState,
    Y2020: information
  })

export const createStore = (): PersistedStore =>
  reduxCreateStore(persistedReducer, applyMiddleware(logger))

export const store = createStore()

export const persistor = persistStore(store)
