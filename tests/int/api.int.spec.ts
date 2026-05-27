import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })

  it('fetches columns', async () => {
    const columns = await payload.find({
      collection: 'columns',
    })
    expect(columns).toBeDefined()
  })

  it('fetches tasks', async () => {
    const tasks = await payload.find({
      collection: 'tasks',
    })
    expect(tasks).toBeDefined()
  })

  it('fetches boards', async () => {
    const boards = await payload.find({
      collection: 'boards',
    })
    expect(boards).toBeDefined()
  })

  it('fetches checklists', async () => {
    const checklists = await payload.find({
      collection: 'checklists',
    })
    expect(checklists).toBeDefined()
  })
})
