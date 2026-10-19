/**
 * Local config-route security tests.
 *
 * The write/read routes are reachable from the desktop renderer over loopback.
 * These tests pin the host allowlist and the per-activation session token so a
 * DNS-rebinding page cannot read or write the configuration.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { isLoopbackHost, registerConfigRoutes } from '../lib/host/routes.js'

const TOKEN = 'test-session-token'

/** Capture the JSON response a handler writes. */
function fakeResponse() {
  const result = { status: 0, body: '', headers: undefined }
  return {
    result,
    writeHead(status, headers) {
      result.status = status
      result.headers = headers
    },
    end(body) {
      result.body = typeof body === 'string' ? body : ''
    },
  }
}

/** Minimal request for a read or a JSON write. */
function fakeRequest(method, headers, body) {
  const request = {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
  return request
}

test('loopback host detection accepts only local authorities', () => {
  assert.equal(isLoopbackHost('127.0.0.1:4507'), true)
  assert.equal(isLoopbackHost('localhost:4507'), true)
  assert.equal(isLoopbackHost('[::1]:4507'), true)
  assert.equal(isLoopbackHost('evil.example:4507'), false)
  assert.equal(isLoopbackHost('127.0.0.1.evil.example:4507'), false)
  assert.equal(isLoopbackHost(undefined), false)
})

test('read/write routes require loopback Host and the session token', async () => {
  const routes = new Map()
  const ctx = {
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => undefined
      },
    },
    effect(callback) {
      callback()
    },
  }
  const saved = []
  const store = {
    mode: 'file',
    current() {
      return { enabled: true }
    },
    async save(next) {
      saved.push(next)
      return next
    },
    async reset() {
      return { enabled: true }
    },
  }
  registerConfigRoutes(ctx, store, TOKEN)
  const read = routes.get('/plugins/dsh-boot-custom/config')
  const write = routes.get('/plugins/dsh-boot-custom/config')
  const reset = routes.get('/plugins/dsh-boot-custom/config/reset')
  assert.equal(typeof read, 'function')

  const denied = fakeResponse()
  read(fakeRequest('GET', { host: '127.0.0.1:4507' }), denied)
  assert.equal(denied.result.status, 403)

  const accepted = fakeResponse()
  read(
    fakeRequest('GET', {
      host: '127.0.0.1:4507',
      'x-dsh-boot-custom-token': TOKEN,
    }),
    accepted,
  )
  assert.equal(accepted.result.status, 200)

  const rebound = fakeResponse()
  read(
    fakeRequest('GET', {
      host: 'evil.example:4507',
      'x-dsh-boot-custom-token': TOKEN,
    }),
    rebound,
  )
  assert.equal(rebound.result.status, 403)

  const writeResponse = fakeResponse()
  await write(
    fakeRequest(
      'POST',
      {
        host: '127.0.0.1:4507',
        'content-type': 'application/json',
        'x-dsh-boot-custom': '1',
        'x-dsh-boot-custom-token': TOKEN,
      },
      { config: { enabled: false } },
    ),
    writeResponse,
  )
  assert.equal(writeResponse.result.status, 200)
  assert.equal(saved.length, 1)

  const resetResponse = fakeResponse()
  await reset(
    fakeRequest(
      'POST',
      {
        host: '127.0.0.1:4507',
        'content-type': 'application/json',
        'x-dsh-boot-custom': '1',
        'x-dsh-boot-custom-token': TOKEN,
      },
      {},
    ),
    resetResponse,
  )
  assert.equal(resetResponse.result.status, 200)
})
