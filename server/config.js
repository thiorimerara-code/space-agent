const path = require("node:path");

const DEFAULT_HOST = process.env.HOST || "0.0.0.0";
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const PROJECT_ROOT = path.join(__dirname, "..");
const APP_ROOT_DIR = path.join(__dirname, "..", "app");
const L0_DIR = path.join(APP_ROOT_DIR, "L0");
const L1_DIR = path.join(APP_ROOT_DIR, "L1");
const L2_DIR = path.join(APP_ROOT_DIR, "L2");
const APP_DIR = L0_DIR;
const ASSET_DIR = path.join(L0_DIR, "assets");
const API_DIR = path.join(__dirname, "api");
const FILE_WATCH_CONFIG_PATH = path.join(__dirname, "lib", "file-watch", "config.yaml");

module.exports = {
  API_DIR,
  APP_ROOT_DIR,
  ASSET_DIR,
  APP_DIR,
  DEFAULT_HOST,
  DEFAULT_PORT,
  FILE_WATCH_CONFIG_PATH,
  L0_DIR,
  L1_DIR,
  L2_DIR,
  PROJECT_ROOT
};
