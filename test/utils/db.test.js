const chai = require('chai')
const _ = require('lodash')
const assert = chai.assert
const wait = require('../helpers/wait')
const tools = require('../helpers/tools')

const txs = require('../fixtures/incomingTransactions')


describe('db', function () {

  let db
  const tx0 = txs[0]

  before(async function () {

    process.env.cacheDuration = 2

    db = require('../../src/utils/db')
    await db.initPg()

  })

  describe('toExpandedKeys', function () {

    it('should return an object with short keys', function () {

      assert.equal(db.toExpandedKeys().b, 'block_number')

    })

  })

  describe('toCompressedKeys', function () {

    it('should return an object with long keys', function () {

      assert.equal(db.toCompressedKeys().block_number, 'b')

    })

  })


  describe('compress', function () {

    it('should compress a full transaction', function () {

      const compressed = db.compress(tx0)

      assert.equal(compressed.b, tx0.block_number)
      assert.equal(compressed.x, tx0.transaction_id)

    })

    it('should compress a filtered transaction', function () {

      const compressed = db.compress(tx0, ['transaction_id'])

      assert.equal(compressed.b, tx0.block_number)
      assert.isUndefined(compressed.x)
    })

  })


  describe('formatKey', function () {

    it('should format a valid key', function () {

      const key = db.formatKey(tx0, ['transaction_id', 'event_name'])
      assert.equal(key, tx0.transaction_id + ':' + tx0.event_name)

    })
  })

  describe('cacheEventByTxId', function () {

    it('should cache a compressed event by txID', async function () {

      await db.cacheEventByTxId(tx0, true)

      const key = db.formatKey(tx0, ['transaction_id'])
      const subKey = db.formatKey(tx0, ['event_name','event_index'])

      const ttl = await db.redis.ttlAsync(key)
      assert.equal(ttl, process.env.cacheDuration)

      const data = await db.redis.hgetallAsync(key)
      assert.isNotNull(data[subKey])

      data[subKey] = JSON.parse(data[subKey])
      assert.equal(data[subKey].b, tx0.block_number)


    })

    it('should cache a compressed event and verify that after the expiration time, it is no more in the db', async function () {

      this.timeout(4000)

      const tx1 = txs[1]

      await db.cacheEventByTxId(tx1, true)

      const key = db.formatKey(tx0, ['transaction_id'])

      let data = await db.redis.hgetallAsync(key)
      assert.equal(typeof data, 'object')

      wait(3)
      data = await db.redis.hgetallAsync(key)
      assert.isNull(data)
    })


    it('should cache multi non compressed events by the same txID', async function () {

      let tx2 = _.clone(txs[2])
      let tx4 = _.clone(txs[4])
      tx4.transaction_id = tx2.transaction_id

      const key = db.formatKey(tx2, ['transaction_id'])

      await db.cacheEventByTxId(tx2)
      await db.cacheEventByTxId(tx4)

      const subKey2 = db.formatKey(tx2, ['event_name','event_index'])
      const subKey4 = db.formatKey(tx4, ['event_name','event_index'])

      const data = await db.redis.hgetallAsync(key)
      assert.isNotNull(data[subKey2])
      assert.isNotNull(data[subKey4])

    })

  })


  describe('cacheEventByContractAddress', function () {

    it('should cache an event by contract address', async function () {

      const tx5 = txs[5]

      await db.cacheEventByContractAddress(tx5)

      const key = db.formatKey(tx5, ['contract_address', 'block_number'])
      const subKey = db.formatKey(tx5, ['event_name','event_index'])

      const ttl = await db.redis.ttlAsync(key)
      assert.equal(ttl, process.env.cacheDuration)

      const data = await db.redis.hgetallAsync(key)
      assert.isNotNull(data[subKey])

      data[subKey] = JSON.parse(data[subKey])
      assert.equal(data[subKey].transaction_id, tx5.transaction_id)

    })

    it('should cache multi events by the same contract address', async function () {

      let contract_address = 'TMYcx6eoRXnePKT1jVn25ZNeMNJ6828HWk'
      let ckeys = {}


      for (let i = 6;i< txs.length;i++) {
        if (txs[i].contract_address === contract_address) {
          await db.cacheEventByContractAddress(txs[i])
          ckeys[db.formatKey(txs[i], ['contract_address', 'block_number'])] = 1
        }
      }


      const keys = await db.redis.keysAsync(`${contract_address}:*`)
      keys.sort(db.sortKeysByBlockNumberDescent)

      for (let i = 0;i<keys.length;i++) {
        let data = await db.redis.hgetallAsync(keys[i])
        let jdata = JSON.parse(data['UserWin:0'])
        assert.equal(jdata.block_number, keys[i].split(':')[1])
      }
    })

  })



  describe('saveEvent', function () {

    it('should save a single event', async function () {

      const tx0 = txs[0]
      tx0.raw_data = {}
      await db.saveEvent(txs[0])

      const result = await db.pg.query('select * from events_log')
      assert.equal(result.rows[0].transaction_id, tx0.transaction_id)

    });
  })
})