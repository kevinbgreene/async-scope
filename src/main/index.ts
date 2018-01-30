import * as asyncHooks from 'async_hooks'
// import { debug } from './debug'

export interface IAsyncScope {
    get<T>(key: string): T | null
    set<T>(key: string, value: T): void
    delete(key: string): void
}

interface IDictionary {
    [key: string]: any
}

interface IAsyncNode {
    id: number
    parentId: number
    exited: boolean
    data: IDictionary
    children: Array<number>
}

interface IAsyncMap {
    [asyncId: number]: IAsyncNode
}

function cleanUpParents(asyncId: number, parentId: number, asyncMap: IAsyncMap): void {
    if (asyncMap[parentId] !== undefined) {
        asyncMap[parentId].children = asyncMap[parentId].children.filter((next: number) => {
            return next !== asyncId
        })

        if (asyncMap[parentId].exited && asyncMap[parentId].children.length === 0) {
            const nextParentId: number = asyncMap[parentId].parentId
            delete asyncMap[parentId]
            cleanUpParents(parentId, nextParentId, asyncMap)
        }
    }
}

function recursiveGet<T>(key: string, asyncId: number, asyncMap: IAsyncMap): T | null {
    if (asyncMap[asyncId] !== undefined) {
        if (asyncMap[asyncId].data[key] !== undefined) {
            return asyncMap[asyncId].data[key]
        } else {
            return recursiveGet<T>(key, asyncMap[asyncId].parentId, asyncMap)
        }
    } else {
        return null
    }
}

function recursiveDelete(key: string, asyncId: number, asyncMap: IAsyncMap): void {
    if (asyncMap[asyncId] !== undefined) {
        const parentId: number = asyncMap[asyncId].parentId

        if (asyncMap[asyncId].data[key] !== undefined) {
            delete asyncMap[asyncId].data[key]
        }

        recursiveDelete(key, parentId, asyncMap)
    }
}

export class AsyncScope implements IAsyncScope {
    private asyncMap: IAsyncMap

    constructor() {
        const self = this
        this.asyncMap = {}

        asyncHooks.createHook({
            init(asyncId, type, triggerAsyncId, resource) {
                if (self.asyncMap[triggerAsyncId] !== undefined) {
                    self.asyncMap[triggerAsyncId].children.push(asyncId)
                }

                self.asyncMap[asyncId] = {
                    id: asyncId,
                    parentId: triggerAsyncId,
                    exited: false,
                    data: {},
                    children: [],
                }
            },
            before(asyncId) {
                // debug('before: ', asyncId)
            },
            after(asyncId) {
                // debug('after: ', asyncId)
            },
            promiseResolve(asyncId) {
                // debug('promiseResolve: ', asyncId)
            },
            destroy(asyncId) {
                // debug('destroy: ', asyncId)
                if (self.asyncMap[asyncId] !== undefined) {
                    // Only delete if the the child scopes are not still active
                    if (self.asyncMap[asyncId].children.length === 0) {
                        const parentId: number = self.asyncMap[asyncId].parentId
                        delete self.asyncMap[asyncId]

                        cleanUpParents(asyncId, parentId, self.asyncMap)

                    // If child scopes are still active mark this scope as exited so we can clean up
                    // when child scopes do exit.
                    } else {
                        self.asyncMap[asyncId].exited = true
                    }
                }
            },
        }).enable()
    }

    public get<T>(key: string): T | null {
        const activeId: number = asyncHooks.executionAsyncId()
        return recursiveGet<T>(key, activeId, this.asyncMap)
    }

    public set<T>(key: string, value: T): void {
        const activeId: number = asyncHooks.executionAsyncId()
        if (this.asyncMap[activeId] !== undefined) {
            this.asyncMap[activeId].data[key] = value
        }
    }

    public delete(key: string): void {
        const activeId: number = asyncHooks.executionAsyncId()
        recursiveDelete(key, activeId, this.asyncMap)
    }
}

export const asyncScope: AsyncScope = new AsyncScope()
