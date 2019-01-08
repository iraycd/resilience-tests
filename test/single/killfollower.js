/* global describe, it, afterEach */
"use strict";

const InstanceManager = require("../../InstanceManager.js");
const endpointToUrl = InstanceManager.endpointToUrl;

const arangojs = require("arangojs");
const expect = require("chai").expect;

const sleep = (ms = 1000) => new Promise(resolve => setTimeout(resolve, ms));

describe("Testing failing followers", async function() {
  const instanceManager = InstanceManager.create();

  beforeEach(async function() {
    await instanceManager.startAgency({ agencySize: 1 });
  });

  afterEach(async function() {
    const currentTest = this.ctx ? this.ctx.currentTest : this.currentTest;
    const retainDir = currentTest.state === "failed";
    instanceManager.moveServerLogs(currentTest);
    try {
      await instanceManager.cleanup(retainDir);
    } catch(e) {
    }
  });

  async function generateData(db, num) {
    const coll = await db.collection("testcollection");
    await coll.create();
    return Promise.all(
      Array.apply(0, Array(num))
        .map((x, i) => i)
        .map(i => coll.save({ test: i }))
    );
  }

  async function checkData(db, num) {
    const cursor = await db.query(`FOR x IN testcollection
                                  SORT x.test ASC RETURN x`);
    expect(cursor.hasNext()).to.equal(true);
    let i = 0;
    while (cursor.hasNext()) {
      const doc = await cursor.next();
      expect(doc.test).to.equal(i++);
    }
    expect(i).to.equal(num);
  }

  [1000, 25000].forEach(numDocs => {
    [2, 4].forEach(n => {
      let f = n / 2;
      it(`with ${n} servers, ${f} fails ${numDocs}`, async function() {
        await instanceManager.startSingleServer("single", n);
        await instanceManager.waitForAllInstances();

        // wait for leader selection
        let uuid = await instanceManager.asyncReplicationLeaderSelected();
        let leader = await instanceManager.asyncReplicationLeaderInstance();

        let db = arangojs({
          url: endpointToUrl(leader.endpoint),
          databaseName: "_system"
        });
        await generateData(db, numDocs);

        for (; f > 0; f--) {
          console.log("Waiting for tick synchronization...");
          let inSync = await instanceManager.asyncReplicationTicksInSync(120.0);
          expect(inSync).to.equal(
            true,
            "followers did not get in sync before timeout"
          );

          // leader should not change
          expect(await instanceManager.asyncReplicationLeaderId()).to.equal(
            uuid
          );

          const followers = instanceManager
            .singleServers()
            .filter(
              inst =>
                inst.status === "RUNNING" && inst.endpoint !== leader.endpoint
            );
          let i = Math.floor(Math.random() * followers.length);
          const follower = followers[i];
          console.log("killing follower %s", follower.endpoint);
          await instanceManager.kill(follower);

          await sleep(1000);
          // leader should not have changed
          expect(await instanceManager.asyncReplicationLeaderId()).to.equal(
            uuid
          );
          if (n > 2) {
            // no slaves alive atm
            inSync = await instanceManager.asyncReplicationTicksInSync(120.0);
            expect(inSync).to.equal(
              true,
              "followers did not get in sync before timeout"
            );
          }

          // check the data on the master
          db = arangojs({
            url: endpointToUrl(leader.endpoint),
            databaseName: "_system"
          });
          await checkData(db, numDocs);

          await instanceManager.restart(follower);
          console.log("killed follower instance restarted");
        }
      });
    });
  });

  [1000, 25000].forEach(numDocs => {
    [2, 4].forEach(n => {
      let f = n - 1;
      it(`with ${n} servers, ${f} failover, no restart ${numDocs}`, async function() {
        await instanceManager.startSingleServer("single", n);
        await instanceManager.waitForAllInstances();

        // wait for leader selection
        let uuid = await instanceManager.asyncReplicationLeaderSelected();
        let leader = await instanceManager.asyncReplicationLeaderInstance();

        let db = arangojs({
          url: endpointToUrl(leader.endpoint),
          databaseName: "_system"
        });
        await generateData(db, numDocs);

        for (; f > 0; f--) {
          console.log("Waiting for tick synchronization...");
          let inSync = await instanceManager.asyncReplicationTicksInSync(120.0);
          expect(inSync).to.equal(
            true,
            "followers did not get in sync before timeout"
          );

          // leader should not change
          expect(await instanceManager.asyncReplicationLeaderId()).to.equal(
            uuid
          );

          let followers = instanceManager
            .singleServers()
            .filter(
              inst =>
                inst.status === "RUNNING" && inst.endpoint !== leader.endpoint
            );
          let i = Math.floor(Math.random() * followers.length);
          const follower = followers[i];
          console.log("killing follower %s", follower.endpoint);
          await instanceManager.kill(follower);

          await sleep(1000);
          // leader should not have changed
          expect(await instanceManager.asyncReplicationLeaderId()).to.equal(
            uuid
          );
          inSync = await instanceManager.asyncReplicationTicksInSync(120.0);
          expect(inSync).to.equal(
            true,
            "followers did not get in sync before timeout"
          );

          // check the data on the master
          db = arangojs({
            url: endpointToUrl(leader.endpoint),
            databaseName: "_system"
          });
          await checkData(db, numDocs);
        }
      });
    });
  });
});
