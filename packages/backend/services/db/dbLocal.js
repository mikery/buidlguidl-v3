/**
 * LOCAL DATABASE
 *
 *  - Users are stored in an object structure, with keys being users' addresses, and values being users' data.
 *  - Events are stored in an array structure. Each item in the array is the event's data.
 */
require("dotenv").config();
const fs = require("fs");
const { getProp } = require("../../utils/object");

const DATABASE_PATH = process.env.DATABASE_PATH ? process.env.DATABASE_PATH : "./local_database/local_db.json";
const SEED_PATH = process.env.SEED_PATH ? process.env.SEED_PATH : "./local_database/seed.json";
const databaseSeed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
const emptyTestDatabase = { version: 0, users: {}, builds: {}, events: [] };

console.log(`using local db: ${DATABASE_PATH}`);

if (!fs.existsSync(DATABASE_PATH)) {
  // Seed the local database if empty.
  fs.copyFileSync(SEED_PATH, DATABASE_PATH, fs.constants.COPYFILE_EXCL);
}

const currentDatabase = JSON.parse(fs.readFileSync(DATABASE_PATH, "utf8"));
const needsToUpdateDbVersion = databaseSeed.version !== currentDatabase.version;
if (needsToUpdateDbVersion) {
  console.log("New local db version: overwriting exiting local_db.json file");
  fs.copyFileSync(SEED_PATH, DATABASE_PATH);
}
let database;
if (process.env.NODE_ENV === "test") {
  database = emptyTestDatabase;
} else {
  database = needsToUpdateDbVersion ? databaseSeed : currentDatabase;
}

// --- Utilities
const persist = () => {
  if (process.env.NODE_ENV === "test") {
    // don't persist during tests
    return;
  }
  const file = fs.openSync(DATABASE_PATH, "w");
  fs.writeFileSync(file, JSON.stringify(database, null, 2));
  fs.closeSync(file);
};

/**
 * @param {*} conditionsArg
 * @returns an array of functions for every condition which returns true if a
 * given event passes the condition.
 */
const generateLocalDbConditionsFromArgs = conditionsArg => {
  return Object.entries(conditionsArg).map(([paths, values]) => {
    const brokenPaths = paths.split(",").map(path => path.split("/"));
    const valuesArray = values.split(",");
    return testedEvent => {
      return brokenPaths.some(pathArray => valuesArray.some(value => getProp(testedEvent, pathArray) === value));
    };
  });
};

// --- Users
const findUserByAddress = builderAddress => {
  if (!database.users[builderAddress]) {
    return { exists: false };
  }
  return { exists: true, data: { id: builderAddress, ...database.users[builderAddress] } };
};

const createUser = (userId, userData) => {
  database.users[userId] = userData;
  persist();
};

const updateUser = (userId, userData) => {
  const { id, ...existingUserData } = findUserByAddress(userId).data;

  database.users[userId] = {
    ...existingUserData,
    ...userData,
  };

  persist();

  return database.users[userId];
};

const findAllUsers = () => {
  return Object.entries(database.users).map(([id, userData]) => ({ id, ...userData }));
};

// --- Streams
const findAllStreams = () => {
  return Object.entries(database.streams).map(([id, streamData]) => ({ id, ...streamData }));
};

// --- Events
const createEvent = event => {
  database.events.push(event);

  persist();
};

const findAllEvents = ({ limit: limitArg } = {}) => {
  const limit = limitArg ?? database.events.length;
  return database.events.slice(limit * -1).reverse();
};

const findEventsWhere = ({ conditions: conditionsArg, limit } = {}) => {
  const allEvents = findAllEvents({ limit });

  const conditions = generateLocalDbConditionsFromArgs(conditionsArg);

  return allEvents.filter(event => conditions.every(condition => condition(event)));
};

const createBuild = build => {
  database.builds.push(build);

  persist();
  return { ...build, id: String(database.builds.length - 1) };
};

const deleteBuild = buildId => {
  database.builds.splice(buildId, 1);

  persist();
};

const findBuildById = buildId => {
  return database.builds[buildId];
};

const findAllBuilds = (featured = null) => {
  const allBuilds = database.builds.map((build, index) => ({ id: index.toString(), ...build }));
  console.log("featured", featured);
  console.log("featured type", typeof featured === "boolean");
  if (typeof featured === "boolean") {
    return allBuilds.filter(build => build.featured);
  }

  return allBuilds;
};

const findBuilderBuilds = builderAddress => {
  return database.builds
    .map((build, index) => ({ id: index.toString(), ...build }))
    .filter(build => build.builder === builderAddress);
};

const featureBuild = (buildId, featured) => {
  const existingBuild = database.builds[buildId];
  existingBuild.featured = featured;
  database.builds[buildId] = existingBuild;

  persist();
};

module.exports = {
  createUser,
  updateUser,
  findAllUsers,
  findUserByAddress,

  findAllStreams,

  createEvent,
  findAllEvents,
  findEventsWhere,

  createBuild,
  deleteBuild,
  findBuildById,
  findAllBuilds,
  findBuilderBuilds,
  featureBuild,

  __internal_database: database, // testing only
};
