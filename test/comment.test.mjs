// node --test 'test/*.test.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const { render, upsert, TEXT, MARKER } = createRequire(import.meta.url)('../lib/comment.cjs')

test('ready lists the URL, extra ports, the mode and the project text', () => {
  const body = render('ready', {
    url: 'https://p-pr-1.t.ts.net',
    sha: 'abcdef1234',
    mode: 'forked',
    ports: '8025=mailpit:8025',
    extra: 'Demo accounts: alice@example.com\n',
  })
  assert.match(body, /\| Application \| https:\/\/p-pr-1\.t\.ts\.net \|/)
  assert.match(body, /\| Port 8025 \(mailpit:8025\) \| https:\/\/p-pr-1\.t\.ts\.net:8025 \|/)
  assert.match(body, /copied from the baseline/)
  assert.match(body, /Demo accounts: alice@example\.com/)
  assert.match(body, /`abcdef1`/)
})

test('failed gives cause, detail and numbered steps; unknown causes point to the logs', () => {
  const body = render('failed', { runUrl: 'https://run', reason: 'https', detail: 'pr-1: x' })
  assert.match(body, /\*\*Cause:\*\* .*HTTPS certificates.*\(pr-1: x\)/)
  assert.match(body, /1\. .*Enable HTTPS/)
  assert.match(body, /3\. Then re-run/)
  assert.match(render('failed', { runUrl: 'https://run' }), /not recognized/)
})

test('languages fall back to English and have the same reasons and modes', () => {
  assert.match(render('destroyed', { language: 'xx' }), /removed/)
  assert.match(render('destroyed', { language: 'zh-CN' }), /已删除/)
  for (const [language, text] of Object.entries(TEXT)) {
    assert.deepEqual(Object.keys(text.reasons).sort(), Object.keys(TEXT.en.reasons).sort(), language)
    assert.deepEqual(Object.keys(text.modes).sort(), Object.keys(TEXT.en.modes).sort(), language)
    for (const [code, reason] of Object.entries(text.reasons)) {
      assert.ok(reason.cause && reason.steps.length > 0, `${language} ${code}`)
    }
  }
})

test('the engine and the comment know the same failure codes', async () => {
  const { readFile } = await import('node:fs/promises')
  const engine = await readFile(new URL('../bin/tailnet-preview', import.meta.url), 'utf8')
  const codes = new Set([...engine.matchAll(/\bfail ("?)([a-z_]+)\1 /g)].map((m) => m[2]))
  codes.delete('code') // fail "$code" inside run_task
  for (const code of codes) assert.ok(TEXT.en.reasons[code], `missing reason for ${code}`)
})

test('upsert updates the marked comment, otherwise creates one', async () => {
  const calls = []
  const github = {
    paginate: async () => [{ id: 7, body: `${MARKER}\nold` }],
    rest: {
      issues: {
        listComments: () => {},
        updateComment: async (a) => calls.push(['update', a.comment_id]),
        createComment: async () => calls.push(['create']),
      },
    },
  }
  const context = { repo: { owner: 'o', repo: 'r' } }
  await upsert({ github, context, issueNumber: 1, body: 'x' })
  github.paginate = async () => []
  await upsert({ github, context, issueNumber: 1, body: 'x' })
  assert.deepEqual(calls, [['update', 7], ['create']])
})
