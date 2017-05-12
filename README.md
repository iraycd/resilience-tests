# ArangoDB resilience tests

This repo contains a testsuite to test some of ArangoDBs resilience capabilities.

Under the hood it is just a more or less standard mocha testsuite plus some stuff to keep arangodb running.

## Requirements

You need a pretty recent v7.6+ nodejs and npm and either a compiled ArangoDB source directory or a docker container you want to test

## Installation

`npm install` will install all required libraries. `yarn` should work too.

## Executing

Simply execute

`npm run test-jenkins`

This will bail out like this:

```
Error: Must specify RESILIENCE_ARANGO_BASEPATH (source root dir including a "build" folder containing compiled binaries or RESILIENCE_DOCKER_IMAGE to test a docker container
```

Specify the path to your arangodb source directory containing a `build` directory where you created an arangodb build.

Then reexecute like this (replace path of course):

`RESILIENCE_ARANGO_BASEPATH=../arangodb npm run test-jenkins`

## Options

RESILIENCE_ARANGO_BASEPATH

    Path to your arangodb source directory containing a build directory with arango executables. Example: "../arangodb"

RESILIENCE_DOCKER_IMAGE

    Docker image to test. Example: "arangdb/arangodb"

LOG_IMMEDIATE

    By default log output is being surpressed and only shown if there is an error. By setting this to 1 the logoutput will be thrown onto the console right away (useful for debugging)

ARANGO_STORAGE_ENGINE

    One of rocksdb or mmfiles (default: mmfiles)

MIN_PORT

    From where the tests should start searching for a free port. defaults to 4000

MAX_PORT

    MAX_PORT. defaults to 65535

PORT_OFFSET

    Port offset. For every request this will be added to the startPort to keep the ports somewhat predicatable. Default 50
    The first request would reveal for example 4000. The second instance would then be assigned port 4050, then 4100 and so forth.

## Mocha options

The tests itself are run through mocha so you can append mocha commands to the `npm run` script as you would expect:

Some Examples:

```
RESILIENCE_ARANGO_BASEPATH=../arangodb npm run test -- --grep "Move shards"
RESILIENCE_ARANGO_BASEPATH=../arangodb ARANGO_STORAGE_ENGINE=rocksdb npm run test -- test/shard-move.js 
```
