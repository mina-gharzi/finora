/**
 * Minimal stand-in for the Drizzle query surface used by the finance
 * data-access modules. It executes no SQL: pre-seeded arrays are returned so
 * that ownership and branching logic can be unit-tested without a database.
 *
 * `select` results are consumed from a queue (one entry per `select` call), so
 * a function that performs several reads can be driven deterministically.
 */
export interface FakeDbState {
  selectQueue: unknown[][];
  insertResult: unknown[];
  updateResult: unknown[];
  deleteResult: unknown[];
  insertedValues: unknown[];
  updatedValues: unknown[];
  insertCalls: number;
  updateCalls: number;
  deleteCalls: number;
  /** Conditions passed to `.where(...)`, in call order (for scope assertions). */
  whereConditions: unknown[];
}

interface Chain extends PromiseLike<unknown[]> {
  from: () => Chain;
  where: (condition?: unknown) => Chain;
  innerJoin: () => Chain;
  leftJoin: () => Chain;
  limit: () => Chain;
  offset: () => Chain;
  orderBy: () => Chain;
  values: (value: unknown) => Chain;
  set: (value: unknown) => Chain;
  returning: () => Promise<unknown[]>;
}

function makeChain(resolveTo: unknown[], state: FakeDbState): Chain {
  const chain: Chain = {
    from: () => chain,
    where: (condition) => {
      state.whereConditions.push(condition);
      return chain;
    },
    innerJoin: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    offset: () => chain,
    orderBy: () => chain,
    values: (value: unknown) => {
      state.insertedValues.push(value);
      return chain;
    },
    set: (value: unknown) => {
      state.updatedValues.push(value);
      return chain;
    },
    returning: () => Promise.resolve(resolveTo),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(resolveTo).then(onFulfilled, onRejected),
  };
  return chain;
}

export function createFakeDb(state: FakeDbState) {
  return {
    select: () => makeChain(state.selectQueue.shift() ?? [], state),
    insert: () => {
      state.insertCalls += 1;
      return makeChain(state.insertResult, state);
    },
    update: () => {
      state.updateCalls += 1;
      return makeChain(state.updateResult, state);
    },
    delete: () => {
      state.deleteCalls += 1;
      return makeChain(state.deleteResult, state);
    },
  };
}

export function createFakeDbState(): FakeDbState {
  return {
    selectQueue: [],
    insertResult: [],
    updateResult: [],
    deleteResult: [],
    insertedValues: [],
    updatedValues: [],
    insertCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    whereConditions: [],
  };
}
