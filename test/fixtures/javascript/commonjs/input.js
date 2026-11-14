"use strict";

const path = require("path");

function zed() {
  return path.join("a", "z");
}

function alpha() {
  return zed();
}

const config = { zed, alpha };

module.exports = config;

function late() {}
function early() {}

exports.late = late;
