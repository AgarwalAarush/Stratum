import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readTradeReview } from '../lib/server/recommendation-trade.ts'
test('trade confirmation rejects changed, cross-owner and expired reviews',()=>{
 process.env.MARKETS_SESSION_SECRET='test-only-secret-more-than-32-characters'
 function token(data:unknown){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return `${payload}.${createHmac('sha256',process.env.MARKETS_SESSION_SECRET!).update(`portfolio-review-v1:${payload}`).digest('hex')}`}
 const review=token({ownerId:'owner',expiresAt:Date.now()+10000,trade:{quantity:2}})
 assert.equal(readTradeReview(review,'owner').trade.quantity,2)
 assert.throws(()=>readTradeReview(review,'different-owner'),/expired/)
 assert.throws(()=>readTradeReview(review.replace(/.$/,'z'),'owner'),/changed/)
 assert.throws(()=>readTradeReview(token({ownerId:'owner',expiresAt:Date.now()-1}),'owner'),/expired/)
})
