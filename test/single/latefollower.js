/* global describe, it, afterEach */
'use strict';

const InstanceManager = require('../../InstanceManager.js');
const endpointToUrl = require('../../common.js').endpointToUrl;

const rp = require('request-promise');
const arangojs = require('arangojs');
const expect = require('chai').expect;
const sleep = (ms= 1000) => new Promise(resolve => setTimeout(resolve, ms));

describe('Adding late followers', async function() {
  const instanceManager = new InstanceManager('setup');

  beforeEach(async function(){
    await instanceManager.startAgency({agencySize:1});        
  });

  afterEach(function() {
    instanceManager.moveServerLogs(this.currentTest);
    return instanceManager.cleanup();
  });

  async function generateData(db, num) {
    let coll = await db.collection("testcollection");
    let cc = 0;
    try {
      let data = await coll.get();
      // collection exists
      data = await coll.count();
      cc += data.count;
    } catch(e) {
      await coll.create();      
    }
    return Promise.all(Array.apply(0, Array(num))
          .map( (x, i) =>  i)
          .map(i => coll.save({test: i + cc})));
  }

  async function checkData(db, num) {
    let cursor = await db.query(`FOR x IN testcollection 
                                  SORT x.test ASC RETURN x`);
    expect(cursor.hasNext()).to.equal(true);
    let i = 0;
    while (cursor.hasNext()) {
      let doc = await cursor.next();
      expect(doc.test).to.equal(i++, "unexpected document on server ");
    }
    expect(i).to.equal(num, "not all documents on server");
  }

  [1000, 5000].forEach(numDocs => {
    for (let n = 1; n <= 3; n++) {
      let f = n + 1;
      it(`with ${n} initial servers, ${f} additional servers ${numDocs}`, async function() {
        await instanceManager.startSingleServer('single', n);
        await instanceManager.waitForAllInstances();
  
        // wait for leader selection
        let uuid = await instanceManager.asyncReplicationLeaderSelected();
        let leader = await instanceManager.asyncReplicationLeaderInstance();
  
        let db = arangojs({ url: endpointToUrl(leader.endpoint), databaseName: '_system' });
        let expectedNumDocs = 0;        
        for (; f > 0; f--) {
          await generateData(db, numDocs);
          expectedNumDocs += numDocs;          

          console.log("Waiting for tick synchronization...");
          let inSync = await instanceManager.asyncReplicationTicksInSync(120.0);
          expect(inSync).to.equal(true, "followers did not get in sync before timeout");  
  
          // starting new follower
          await instanceManager.startSingleServer('single', 1);
          await instanceManager.waitForAllInstances();

          // leader should not change
          expect(await instanceManager.asyncReplicationLeaderId()).to.equal(uuid);
          // new followe should get in sync     
          inSync = await instanceManager.asyncReplicationTicksInSync(120.0);
          expect(inSync).to.equal(true, "followers did not get in sync before timeout");            
          // leader should not change
          expect(await instanceManager.asyncReplicationLeaderId()).to.equal(uuid);          
          
          // FIXME: use read only mode to verify data on followers
          // check the data on the master
          // db = arangojs({ url: endpointToUrl(leader.endpoint), databaseName: '_system' });
          //await checkData(db, numDocs);
        }
        await checkData(db, expectedNumDocs);        
      });
    }
  });
});
